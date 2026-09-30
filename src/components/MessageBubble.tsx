import type { ChatMessage } from '../types'

type MessageBubbleProps = {
  message: ChatMessage
  /** True only for the answer that is still arriving. */
  showIndicator?: boolean
}

/** One user or assistant message: plain text, no markdown, with the activity indicator while it streams. */
export function MessageBubble({ message, showIndicator = false }: MessageBubbleProps) {
  const isUser = message.kind === 'user'

  return (
    <article
      className={isUser ? 'message message--user' : 'message message--assistant'}
      aria-label={isUser ? 'Сообщение пользователя' : 'Ответ ассистента'}
    >
      <p className="message__text">{message.content}</p>
      {showIndicator && (
        <span className="message__indicator" role="status">
          Ассистент печатает…
        </span>
      )}
    </article>
  )
}
