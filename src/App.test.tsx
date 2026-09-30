/**
 * T-18: сборка экрана. Счастливый путь (реплика появляется сразу, ответ растёт по кадрам,
 * индикатор виден во время запроса) и путь ошибки (баннер, история цела, приложение живо).
 * Модуль `api/chatApi` замокан — сеть не используется (NFR-01).
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { ChatRequestError, streamChat } from './api/chatApi'

vi.mock('./api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/chatApi')>()
  return { ...actual, streamChat: vi.fn() }
})

const streamChatMock = vi.mocked(streamChat)

/** Управляемый поток: тест сам решает, когда придут куски и чем всё закончится. */
interface ControlledStream {
  onChunk: (text: string) => void
  resolve: (answer: string) => void
  reject: (error: unknown) => void
}

function mockStream(): ControlledStream {
  const state: Partial<ControlledStream> = {}
  streamChatMock.mockImplementation((_request, onChunk) => {
    state.onChunk = onChunk
    return new Promise<string>((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
  })
  return state as ControlledStream
}

/** Вводит реплику и отправляет её формой. */
async function sendMessage(text: string): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Сообщение'), text)
  await user.click(screen.getByRole('button', { name: 'Отправить' }))
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    streamChatMock.mockReset()
    // В jsdom `scrollIntoView` не реализован — ChatWindow не должен из-за этого падать.
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('рендерит шапку, селект модели и пустую переписку', () => {
    const { container } = render(<App />)

    expect(screen.getByRole('heading', { name: 'Ai-Turbo Chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('Модель')).toHaveValue('deepseek')
    expect(screen.getByRole('log')).toBeEmptyDOMElement()
    expect(container.querySelectorAll('.message')).toHaveLength(0)
  })

  it('показывает реплику сразу, растит ответ по кадрам и убирает индикатор в конце', async () => {
    const stream = mockStream()
    render(<App />)

    await sendMessage('Какая погода в Москве?')

    // Реплика и индикатор появляются до первого кадра (FR-02, FR-05).
    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent(
      'Какая погода в Москве?',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Ассистент печатает…')
    expect(streamChatMock.mock.calls[0][0]).toEqual({
      messages: [{ role: 'user', content: 'Какая погода в Москве?' }],
      model: 'deepseek',
    })

    await act(async () => {
      stream.onChunk('Сейчас ')
    })
    // normalizeWhitespace: false — иначе matcher срезает пробел и «рост» текста не проверить.
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас ', {
      normalizeWhitespace: false,
    })

    await act(async () => {
      stream.onChunk('в Москве +15°C')
    })
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас в Москве +15°C')

    await act(async () => {
      stream.resolve('Сейчас в Москве +15°C')
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас в Москве +15°C')
    expect(screen.getByLabelText('Сообщение')).toBeEnabled()
  })

  it('показывает ошибку баннером, сохраняя историю и работоспособность', async () => {
    const stream = mockStream()
    render(<App />)

    await sendMessage('привет')
    await act(async () => {
      stream.reject(new ChatRequestError('LLM provider is unavailable', 503))
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('LLM provider is unavailable')
    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('привет')
    expect(screen.queryByLabelText('Ответ ассистента')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('Сообщение')).toBeEnabled()

    // Следующий ход уходит с прежней историей и работает.
    const nextStream = mockStream()
    await sendMessage('ещё раз')
    expect(streamChatMock.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'привет' },
      { role: 'user', content: 'ещё раз' },
    ])

    await act(async () => {
      nextStream.resolve('готово')
    })
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('готово')
  })

  it('шлёт выбранную в селекторе модель', async () => {
    const stream = mockStream()
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('Модель'), 'local')
    await sendMessage('привет')

    expect(streamChatMock.mock.calls[0][0].model).toBe('local')
    await act(async () => {
      stream.resolve('готово')
    })
  })
})
