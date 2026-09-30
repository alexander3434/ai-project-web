import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from './api/chatApi'
import { ChatRequestError } from './api/chatApi'
import App from './App'

vi.mock('./api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/chatApi')>()
  return { ...actual, streamChat: vi.fn() }
})

const { streamChat } = await import('./api/chatApi')
const streamChatMock = vi.mocked(streamChat)

/** A controllable stream: the test drives the chunks and the terminal frame. */
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

describe('App', () => {
  it('shows the empty chat shell with the model selector', () => {
    controlledStream()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Ai-Turbo Chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('Модель')).toHaveValue('deepseek')
    expect(screen.getByRole('log')).toBeEmptyDOMElement()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders the user turn at once and grows the answer from the streamed chunks', async () => {
    const user = userEvent.setup()
    const stream = controlledStream()
    render(<App />)

    await user.type(screen.getByLabelText('Сообщение'), 'Какая погода в Москве?{Enter}')

    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('Какая погода в Москве?')
    expect(screen.getByRole('status')).toHaveTextContent('Ассистент печатает…')
    expect(streamChatMock.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'Какая погода в Москве?' },
    ])

    act(() => stream.push('Сейчас '))
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас ')

    act(() => stream.push('в Москве +15.4°C, облачно'))
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас в Москве +15.4°C, облачно')

    await act(async () => stream.finish('Сейчас в Москве +15.4°C, облачно'))

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас в Москве +15.4°C, облачно')
    expect(screen.getByLabelText('Сообщение')).toBeEnabled()
  })

  it('shows the error banner, keeps the history and stays usable', async () => {
    const user = userEvent.setup()
    const stream = controlledStream()
    render(<App />)

    await user.type(screen.getByLabelText('Сообщение'), 'Какая погода в Москве?{Enter}')
    await act(async () => stream.fail(new ChatRequestError('LLM provider is unavailable', 503)))

    expect(screen.getByRole('alert')).toHaveTextContent('LLM provider is unavailable')
    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('Какая погода в Москве?')
    expect(screen.queryByLabelText('Ответ ассистента')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    const next = controlledStream()
    await user.type(screen.getByLabelText('Сообщение'), 'А теперь с deepseek{Enter}')

    expect(streamChatMock.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Какая погода в Москве?' },
      { role: 'user', content: 'А теперь с deepseek' },
    ])
    act(() => next.push('Готово'))
    await act(async () => next.finish('Готово'))
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Готово')
  })

  it('sends the provider chosen in the selector', async () => {
    const user = userEvent.setup()
    controlledStream()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('Модель'), 'local')
    await user.type(screen.getByLabelText('Сообщение'), 'Привет{Enter}')

    expect(streamChatMock.mock.calls[0][0].model).toBe('local')
  })

  it('restores the stored conversation on the next visit', async () => {
    const user = userEvent.setup()
    const stream = controlledStream()
    const first = render(<App />)

    await user.type(screen.getByLabelText('Сообщение'), 'Погода?{Enter}')
    act(() => stream.push('Сейчас +15.4°C'))
    await act(async () => stream.finish('Сейчас +15.4°C'))
    first.unmount()

    render(<App />)

    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('Погода?')
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас +15.4°C')
  })
})
