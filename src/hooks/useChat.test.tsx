/**
 * T-15: хук `useChat` — единственный владелец состояния чата. Тесты офлайн: модуль `api/chatApi`
 * замокан (потоком управляет тест), сеть не используется (NFR-01).
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from './useChat'
import { CHAT_STORAGE_KEY } from './chatStorage'
import { ChatRequestError, streamChat } from '../api/chatApi'
import type { ChatMessage } from '../types'

vi.mock('../api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/chatApi')>()
  return { ...actual, streamChat: vi.fn() }
})

const streamChatMock = vi.mocked(streamChat)

/** Запрос, который хук собрал на последнем вызове `streamChat`. */
function lastRequest(): { messages: Array<{ role: string; content: string }>; model: string } {
  return streamChatMock.mock.calls.at(-1)?.[0] as {
    messages: Array<{ role: string; content: string }>
    model: string
  }
}

/** Управляемый поток: тест сам решает, когда придут куски и чем всё закончится. */
interface ControlledStream {
  onChunk: (text: string) => void
  resolve: (answer: string) => void
  reject: (error: unknown) => void
  signal: AbortSignal | undefined
}

function mockStream(): ControlledStream {
  const state: Partial<ControlledStream> = {}
  streamChatMock.mockImplementation((_request, onChunk, signal) => {
    state.onChunk = onChunk
    state.signal = signal
    return new Promise<string>((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
  })
  return state as ControlledStream
}

/** Сохранённая история из localStorage. */
function storedMessages(): ChatMessage[] {
  return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) ?? '[]') as ChatMessage[]
}

describe('useChat', () => {
  beforeEach(() => {
    localStorage.clear()
    streamChatMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('стартует с пустой беседой и моделью deepseek', () => {
    const { result } = renderHook(() => useChat())

    expect(result.current.messages).toEqual([])
    expect(result.current.model).toBe('deepseek')
    expect(result.current.isStreaming).toBe(false)
  })

  it('восстанавливает историю из хранилища в исходном порядке', () => {
    const stored: ChatMessage[] = [
      { id: 'u1', kind: 'user', content: 'Какая погода?' },
      { id: 'a1', kind: 'assistant', content: 'Облачно' },
    ]
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored))

    const { result } = renderHook(() => useChat())

    expect(result.current.messages).toEqual(stored)
  })

  it('игнорирует пустой и пробельный ввод', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('   ')
    })

    expect(streamChatMock).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
  })

  it('добавляет реплику пользователя и плейсхолдер, дописывая куски по кадру', async () => {
    const stream = mockStream()
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('  Какая погода в Москве?  ')
    })

    expect(result.current.isStreaming).toBe(true)
    expect(result.current.messages).toEqual([
      { id: expect.any(String), kind: 'user', content: 'Какая погода в Москве?' },
      { id: expect.any(String), kind: 'assistant', content: '' },
    ])
    expect(lastRequest()).toEqual({
      messages: [{ role: 'user', content: 'Какая погода в Москве?' }],
      model: 'deepseek',
    })

    act(() => {
      stream.onChunk('Сейчас ')
    })
    expect(result.current.messages.at(-1)?.content).toBe('Сейчас ')

    act(() => {
      stream.onChunk('в Москве +15°C')
    })
    expect(result.current.messages.at(-1)?.content).toBe('Сейчас в Москве +15°C')
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      stream.resolve('Сейчас в Москве +15°C')
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages.at(-1)).toMatchObject({
      kind: 'assistant',
      content: 'Сейчас в Москве +15°C',
    })
  })

  it('шлёт полную историю без error-записей и без локальных полей', () => {
    const stored: ChatMessage[] = [
      { id: 'u1', kind: 'user', content: 'Какая погода?' },
      { id: 'a1', kind: 'assistant', content: 'Облачно' },
      { id: 'e1', kind: 'error', content: 'Соединение прервано' },
    ]
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored))
    const stream = mockStream()
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('А завтра?')
    })

    expect(lastRequest().messages).toEqual([
      { role: 'user', content: 'Какая погода?' },
      { role: 'assistant', content: 'Облачно' },
      { role: 'user', content: 'А завтра?' },
    ])
    expect(Object.keys(lastRequest()).sort()).toEqual(['messages', 'model'])
    expect(stream.onChunk).toBeTypeOf('function')
  })

  it('отправляет выбранную модель и не персистит её', () => {
    mockStream()
    const first = renderHook(() => useChat())

    act(() => {
      first.result.current.setModel('local')
    })
    expect(first.result.current.model).toBe('local')

    act(() => {
      first.result.current.send('привет')
    })
    expect(lastRequest().model).toBe('local')

    first.unmount()
    const second = renderHook(() => useChat())
    expect(second.result.current.model).toBe('deepseek')
  })

  it('игнорирует отправку во время активного запроса', () => {
    mockStream()
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('раз')
    })
    act(() => {
      result.current.send('два')
    })

    expect(streamChatMock).toHaveBeenCalledTimes(1)
    expect(result.current.messages.filter((message) => message.kind === 'user')).toHaveLength(1)
  })

  it('на ошибке выбрасывает плейсхолдер, добавляет error-запись и остаётся рабочим', async () => {
    const stream = mockStream()
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('привет')
    })
    act(() => {
      stream.onChunk('частичный ответ')
    })

    await act(async () => {
      stream.reject(new ChatRequestError('LLM provider is unavailable', 503))
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages).toEqual([
      { id: expect.any(String), kind: 'user', content: 'привет' },
      { id: expect.any(String), kind: 'error', content: 'LLM provider is unavailable' },
    ])

    const nextStream = mockStream()
    act(() => {
      result.current.send('ещё раз')
    })
    expect(streamChatMock).toHaveBeenCalledTimes(2)
    expect(lastRequest().messages).toEqual([
      { role: 'user', content: 'привет' },
      { role: 'user', content: 'ещё раз' },
    ])

    await act(async () => {
      nextStream.resolve('готово')
    })
    expect(result.current.messages.at(-1)).toMatchObject({ kind: 'assistant', content: 'готово' })
  })

  it('даёт общий текст, если упало не-Error значение', async () => {
    const stream = mockStream()
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.send('привет')
    })
    await act(async () => {
      stream.reject('строковый сбой')
    })

    expect(result.current.messages.at(-1)).toMatchObject({
      kind: 'error',
      content: 'Не удалось получить ответ',
    })
  })

  it('персистит историю и восстанавливает её вместе с error-записями', async () => {
    const stream = mockStream()
    const first = renderHook(() => useChat())

    await act(async () => {
      first.result.current.send('привет')
      stream.resolve('здравствуйте')
    })
    act(() => {
      first.result.current.send('и ещё')
    })
    await act(async () => {
      stream.reject(new ChatRequestError('Соединение прервано'))
    })

    const expected = first.result.current.messages
    expect(expected.map((message) => message.kind)).toEqual(['user', 'assistant', 'user', 'error'])
    expect(storedMessages()).toEqual(expected)

    first.unmount()
    const second = renderHook(() => useChat())
    expect(second.result.current.messages).toEqual(expected)
  })

  it('отменяет запрос при размонтировании и не пишет error-запись', async () => {
    const stream = mockStream()
    const { result, unmount } = renderHook(() => useChat())

    act(() => {
      result.current.send('привет')
    })
    expect(stream.signal?.aborted).toBe(false)

    unmount()
    expect(stream.signal?.aborted).toBe(true)

    await act(async () => {
      stream.reject(new DOMException('Отменено', 'AbortError'))
    })
    expect(storedMessages().some((message) => message.kind === 'error')).toBe(false)
  })
})
