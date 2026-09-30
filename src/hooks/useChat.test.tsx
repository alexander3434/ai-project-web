import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from '../api/chatApi'
import { ChatRequestError } from '../api/chatApi'
import type { ChatMessage } from '../types'
import { useChat } from './useChat'

vi.mock('../api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/chatApi')>()
  return { ...actual, streamChat: vi.fn() }
})

const { streamChat } = await import('../api/chatApi')
const streamChatMock = vi.mocked(streamChat)

/** A controllable stream: the test pushes chunks and finishes the request itself. */
function controlledStream() {
  let push: (text: string) => void = () => {}
  let finish: (answer: string) => void = () => {}
  let fail: (error: unknown) => void = () => {}
  streamChatMock.mockImplementation(
    (_request: ChatRequest, onChunk: (text: string) => void) =>
      new Promise<string>((resolve, reject) => {
        push = onChunk
        finish = resolve
        fail = reject
      }),
  )
  return {
    push: (text: string) => push(text),
    finish: (answer: string) => finish(answer),
    fail: (error: unknown) => fail(error),
  }
}

beforeEach(() => {
  localStorage.clear()
  streamChatMock.mockReset()
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useChat', () => {
  it('restores the stored conversation and defaults to the deepseek model', () => {
    const stored: ChatMessage[] = [
      { id: '1', kind: 'user', content: 'Какая погода в Москве?' },
      { id: '2', kind: 'assistant', content: 'Сейчас +15.4°C' },
    ]
    localStorage.setItem('ai-turbo-chat-history', JSON.stringify(stored))

    const { result } = renderHook(() => useChat())

    expect(result.current.messages).toEqual(stored)
    expect(result.current.model).toBe('deepseek')
    expect(result.current.isStreaming).toBe(false)
  })

  it('appends the user turn at once and streams the answer into a placeholder, piece by piece', async () => {
    const stream = controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('Какая погода в Москве?'))

    expect(result.current.isStreaming).toBe(true)
    expect(result.current.messages.map(({ kind, content }) => ({ kind, content }))).toEqual([
      { kind: 'user', content: 'Какая погода в Москве?' },
      { kind: 'assistant', content: '' },
    ])

    act(() => stream.push('Сейчас '))
    expect(result.current.messages[1].content).toBe('Сейчас ')

    act(() => stream.push('в Москве +15.4°C'))
    expect(result.current.messages[1].content).toBe('Сейчас в Москве +15.4°C')

    await act(async () => stream.finish('Сейчас в Москве +15.4°C'))

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages[1]).toEqual({
      id: result.current.messages[1].id,
      kind: 'assistant',
      content: 'Сейчас в Москве +15.4°C',
    })
  })

  it('sends the whole history without error entries and with the model', () => {
    const history: ChatMessage[] = [
      { id: '1', kind: 'user', content: 'Какая погода в Москве?' },
      { id: '2', kind: 'assistant', content: 'Сейчас +15.4°C' },
      { id: '3', kind: 'error', content: 'LLM provider is unavailable' },
    ]
    localStorage.setItem('ai-turbo-chat-history', JSON.stringify(history))
    controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('А завтра?'))

    expect(streamChatMock).toHaveBeenCalledOnce()
    expect(streamChatMock.mock.calls[0][0]).toEqual({
      messages: [
        { role: 'user', content: 'Какая погода в Москве?' },
        { role: 'assistant', content: 'Сейчас +15.4°C' },
        { role: 'user', content: 'А завтра?' },
      ],
      model: 'deepseek',
    })
  })

  it('sends the selected model with the next request', () => {
    controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.setModel('local'))
    act(() => result.current.send('Привет'))

    expect(result.current.model).toBe('local')
    expect(streamChatMock.mock.calls[0][0].model).toBe('local')
  })

  it('ignores blank input and sends while a request is in flight', () => {
    controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('   '))
    act(() => result.current.send(''))
    expect(streamChatMock).not.toHaveBeenCalled()

    act(() => result.current.send('Первый'))
    act(() => result.current.send('Второй'))

    expect(streamChatMock).toHaveBeenCalledOnce()
    expect(result.current.messages.filter((message) => message.kind === 'user')).toHaveLength(1)
  })

  it('trims the outgoing text and keeps the rendered message trimmed', () => {
    controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('  Погода?  '))

    expect(streamChatMock.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Погода?' }])
    expect(result.current.messages[0].content).toBe('Погода?')
  })

  it('replaces the placeholder with an error entry and keeps the history', async () => {
    const stream = controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('Погода?'))
    act(() => stream.push('Сейчас '))
    await act(async () => stream.fail(new ChatRequestError('LLM provider is unavailable', 503)))

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages.map(({ kind, content }) => ({ kind, content }))).toEqual([
      { kind: 'user', content: 'Погода?' },
      { kind: 'error', content: 'LLM provider is unavailable' },
    ])
  })

  it('works again after a failure and sends the surviving history', async () => {
    const first = controlledStream()
    const { result } = renderHook(() => useChat())

    act(() => result.current.send('Погода?'))
    await act(async () => first.fail(new ChatRequestError('Соединение прервано')))

    controlledStream()
    act(() => result.current.send('Ещё раз'))

    expect(streamChatMock.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Погода?' },
      { role: 'user', content: 'Ещё раз' },
    ])
  })

  it('persists every change and restores it after a remount, error entries included', async () => {
    const first = controlledStream()
    const { result, unmount } = renderHook(() => useChat())

    act(() => result.current.send('Погода?'))
    act(() => first.push('Сейчас +15.4°C'))
    await act(async () => first.finish('Сейчас +15.4°C'))

    const second = controlledStream()
    act(() => result.current.send('А завтра?'))
    await act(async () => second.fail(new ChatRequestError('Соединение прервано')))
    unmount()

    const restored = renderHook(() => useChat())

    expect(restored.result.current.messages.map(({ kind, content }) => ({ kind, content }))).toEqual([
      { kind: 'user', content: 'Погода?' },
      { kind: 'assistant', content: 'Сейчас +15.4°C' },
      { kind: 'user', content: 'А завтра?' },
      { kind: 'error', content: 'Соединение прервано' },
    ])
    expect(Object.keys(localStorage)).toEqual(['ai-turbo-chat-history'])
  })

  it('aborts an in-flight request on unmount without adding an error entry', async () => {
    const stream = controlledStream()
    const { result, unmount } = renderHook(() => useChat())

    act(() => result.current.send('Погода?'))
    const signal = streamChatMock.mock.calls[0][2]
    expect(signal?.aborted).toBe(false)

    unmount()

    expect(signal?.aborted).toBe(true)
    await act(async () => stream.fail(new DOMException('Aborted', 'AbortError')))
    expect(localStorage.getItem('ai-turbo-chat-history')).not.toContain('error')
  })
})
