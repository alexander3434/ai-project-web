import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../types'
import { ChatWindow } from './ChatWindow'
import { MessageList } from './MessageList'

const user: ChatMessage = { id: '1', kind: 'user', content: 'Какая погода в Москве?' }
const answer: ChatMessage = { id: '2', kind: 'assistant', content: 'Сейчас +15.4°C, облачно.' }
const failure: ChatMessage = { id: '3', kind: 'error', content: 'LLM provider is unavailable' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MessageList', () => {
  it('renders a user bubble and an assistant bubble in order', () => {
    render(<MessageList messages={[user, answer]} isStreaming={false} />)

    const bubbles = screen.getAllByRole('article')
    expect(bubbles).toHaveLength(2)
    expect(screen.getByLabelText('Сообщение пользователя')).toHaveClass('message', 'message--user')
    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('Какая погода в Москве?')
    expect(screen.getByLabelText('Ответ ассистента')).toHaveClass('message', 'message--assistant')
    expect(screen.getByLabelText('Ответ ассистента')).toHaveTextContent('Сейчас +15.4°C, облачно.')
  })

  it('renders an error entry as an alert banner', () => {
    render(<MessageList messages={[user, failure]} isStreaming={false} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('message', 'message--error')
    expect(alert).toHaveTextContent('LLM provider is unavailable')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('renders the message text as plain text', () => {
    const dangerous: ChatMessage = { id: '4', kind: 'user', content: '<b>жирный</b> & <img src=x>' }
    render(<MessageList messages={[dangerous]} isStreaming={false} />)

    expect(screen.getByLabelText('Сообщение пользователя')).toHaveTextContent('<b>жирный</b> & <img src=x>')
    expect(screen.queryByText('жирный')).toBeNull()
  })

  it('announces that the assistant is typing only for the in-progress answer', () => {
    const placeholder: ChatMessage = { id: '5', kind: 'assistant', content: '' }
    const { rerender } = render(<MessageList messages={[user, answer, placeholder]} isStreaming />)

    const articles = screen.getAllByRole('article')
    expect(within(articles[1]).queryByRole('status')).toBeNull()
    expect(within(articles[2]).getByRole('status')).toHaveTextContent('Ассистент печатает…')
    expect(screen.getAllByRole('status')).toHaveLength(1)

    rerender(<MessageList messages={[user, answer, placeholder]} isStreaming={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('is a live log region', () => {
    render(<MessageList messages={[user]} isStreaming={false} />)

    const log = screen.getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
  })
})

describe('ChatWindow', () => {
  function renderWindow(messages: ChatMessage[], isStreaming = false) {
    return render(<ChatWindow messages={messages} isStreaming={isStreaming} />)
  }

  function windowElement(): HTMLElement {
    const element = document.querySelector('.chat-window')
    if (element === null) throw new Error('chat window not rendered')
    return element as HTMLElement
  }

  it('pins the view to the newest content while the user is at the bottom', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const { rerender } = renderWindow([user])
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })

    scrollIntoView.mockClear()
    rerender(<ChatWindow messages={[user, answer]} isStreaming />)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('does not yank the view when the user has scrolled up', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = renderWindow([user])

    const element = windowElement()
    Object.defineProperty(element, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(element, 'clientHeight', { value: 400, configurable: true })
    element.scrollTop = 100
    fireEvent.scroll(element)

    scrollIntoView.mockClear()
    rerender(<ChatWindow messages={[user, answer]} isStreaming />)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
