import type { ChatMessage } from '../types'
import { ErrorBanner } from './ErrorBanner'
import { MessageBubble } from './MessageBubble'

type MessageListProps = {
  messages: ChatMessage[]
  isStreaming: boolean
}

/** The conversation in order: one bubble per turn, one banner per failure. */
export function MessageList({ messages, isStreaming }: MessageListProps) {
  return (
    <div className="message-list" role="log" aria-live="polite">
      {messages.map((message, index) => {
        if (message.kind === 'error') {
          return <ErrorBanner key={message.id} content={message.content} />
        }
        const isInProgress = isStreaming && message.kind === 'assistant' && index === messages.length - 1
        return <MessageBubble key={message.id} message={message} showIndicator={isInProgress} />
      })}
    </div>
  )
}
