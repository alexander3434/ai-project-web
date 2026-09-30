import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import { MessageList } from './MessageList'

type ChatWindowProps = {
  messages: ChatMessage[]
  isStreaming: boolean
}

/** How close to the bottom still counts as "following the answer". */
const NEAR_BOTTOM_PX = 80

/**
 * The scroll container. It follows the newest content while the user is at the
 * bottom and leaves the view alone as soon as they scroll up.
 */
export function ChatWindow({ messages, isStreaming }: ChatWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  function handleScroll(): void {
    const container = containerRef.current
    if (container === null) return
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    followRef.current = distance <= NEAR_BOTTOM_PX
  }

  useEffect(() => {
    if (!followRef.current) return
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, isStreaming])

  return (
    <div className="chat-window" ref={containerRef} onScroll={handleScroll}>
      <MessageList messages={messages} isStreaming={isStreaming} />
      <div ref={endRef} />
    </div>
  )
}
