/**
 * T-16: список сообщений, пузыри, баннер ошибки, индикатор активности и доскролл окна переписки.
 * Тесты офлайн, на jsdom (раскладки нет — `scrollIntoView` подменяется шпионом).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatWindow } from './ChatWindow'
import { MessageList } from './MessageList'
import type { ChatMessage } from '../types'

const userMessage: ChatMessage = { id: 'u1', kind: 'user', content: 'Какая погода в Москве?' }
const assistantMessage: ChatMessage = { id: 'a1', kind: 'assistant', content: 'Облачно, +15°C' }
const errorMessage: ChatMessage = { id: 'e1', kind: 'error', content: 'Соединение прервано' }

/** В jsdom `scrollIntoView` не реализован: подменяем, чтобы проверить вызов (T-16). */
const scrollIntoViewMock = vi.fn<Element['scrollIntoView']>()

describe('MessageList', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear()
    Element.prototype.scrollIntoView = scrollIntoViewMock
  })

  it('рендерит реплики пользователя и ассистента разными пузырями', () => {
    render(<MessageList messages={[userMessage, assistantMessage]} isStreaming={false} />)

    const userBubble = screen.getByLabelText('Сообщение пользователя')
    expect(userBubble).toHaveClass('message', 'message--user')
    expect(userBubble).toHaveTextContent('Какая погода в Москве?')

    const assistantBubble = screen.getByLabelText('Ответ ассистента')
    expect(assistantBubble).toHaveClass('message', 'message--assistant')
    expect(assistantBubble).toHaveTextContent('Облачно, +15°C')
    expect(assistantBubble.querySelector('.message__text')).not.toBeNull()
  })

  it('показывает запись об ошибке отдельным баннером', () => {
    render(<MessageList messages={[userMessage, errorMessage]} isStreaming={false} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('message', 'message--error')
    expect(alert).toHaveTextContent('Соединение прервано')
    expect(screen.queryByLabelText('Ответ ассистента')).toBeNull()
  })

  it('ведёт список как log с вежливым live-регионом', () => {
    render(<MessageList messages={[userMessage]} isStreaming={false} />)

    const log = screen.getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveClass('message-list')
  })

  it('рендерит текст как обычный текст, без разметки', () => {
    const markup: ChatMessage = { id: 'm1', kind: 'assistant', content: '<b>не разметка</b>' }
    const { container } = render(<MessageList messages={[markup]} isStreaming={false} />)

    expect(screen.getByText('<b>не разметка</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('показывает индикатор «Ассистент печатает…» только во время стрима', () => {
    const { rerender } = render(<MessageList messages={[userMessage]} isStreaming />)

    const indicator = screen.getByRole('status')
    expect(indicator).toHaveClass('typing-indicator')
    expect(indicator).toHaveTextContent('Ассистент печатает…')
    expect(indicator.querySelectorAll('.typing-indicator__dot')).toHaveLength(3)

    rerender(<MessageList messages={[userMessage, assistantMessage]} isStreaming={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('рендерит пустой список без заглушек', () => {
    const { container } = render(<MessageList messages={[]} isStreaming={false} />)

    expect(screen.getByRole('log')).toBeEmptyDOMElement()
    expect(container.querySelectorAll('.message')).toHaveLength(0)
  })
})

describe('ChatWindow', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear()
    Element.prototype.scrollIntoView = scrollIntoViewMock
  })

  it('доскроллит к свежему сообщению, пока пользователь у низа', () => {
    const { rerender } = render(<ChatWindow messages={[userMessage]} isStreaming={false} />)

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })

    scrollIntoViewMock.mockClear()
    rerender(<ChatWindow messages={[userMessage, assistantMessage]} isStreaming />)

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('не дёргает вид, если пользователь отлистал вверх', () => {
    const { container, rerender } = render(
      <ChatWindow messages={[userMessage]} isStreaming={false} />,
    )
    const windowElement = container.querySelector<HTMLElement>('.chat-window')
    if (windowElement === null) throw new Error('Контейнер .chat-window не отрендерился')

    Object.defineProperty(windowElement, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(windowElement, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(windowElement, 'scrollTop', { configurable: true, value: 100 })
    fireEvent.scroll(windowElement)

    scrollIntoViewMock.mockClear()
    rerender(<ChatWindow messages={[userMessage, assistantMessage]} isStreaming={false} />)

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })
})
