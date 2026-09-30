/**
 * Прокручиваемый контейнер переписки (T-16, FR-02).
 *
 * Ответственность: оболочка списка сообщений и удержание вида у самого свежего контента.
 * Данные не запрашивает и не хранит — получает готовый список пропсами от `App.tsx`.
 *
 * Поведение:
 *   - контейнер со скроллом и «маяк» в конце списка (ref на пустой элемент после `MessageList`);
 *   - при изменении `messages`/`isStreaming` вызывается
 *     `endRef.current?.scrollIntoView({ block: 'nearest' })` — но ТОЛЬКО если пользователь уже
 *     у низа (порог по `scrollHeight - scrollTop - clientHeight`): когда пользователь отлистал
 *     вверх читать историю, вид не дёргается (T-16);
 *   - маркер «у низа» обновляется обработчиком `onScroll` контейнера, чтобы решение принималось по
 *     последней позиции, а не по устаревшему значению;
 *   - в jsdom нет раскладки, `scrollIntoView` — заглушка: тесты проверяют вызов через spy.
 *
 * Взаимодействие: рендерит `./MessageList`; классы — `chat-window`, `chat-window__end` (см. index.css).
 */

import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import { MessageList } from './MessageList'

/** Пропсы: ровно то состояние useChat, которое нужно списку (см. `hooks/useChat.ts`). */
export interface ChatWindowProps {
  /** Сообщения в порядке разговора (включая записи `kind: 'error'`). */
  messages: ChatMessage[]
  /** `true`, пока идёт запрос: включает индикатор активности и триггерит доскролл. */
  isStreaming: boolean
}

/** Порог «пользователь у низа» в пикселях: больше — считаем, что историю читают вверх. */
const NEAR_BOTTOM_PX = 48

/** Прокручиваемый контейнер переписки; в скелете — без разметки. */
export function ChatWindow({ messages, isStreaming }: ChatWindowProps): ReactElement | null {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  // Решение о доскролле принимается по последней позиции скролла, а не по устаревшему значению.
  const isNearBottomRef = useRef(true)

  const handleScroll = () => {
    const container = containerRef.current
    if (container === null) return
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    isNearBottomRef.current = distance <= NEAR_BOTTOM_PX
  }

  useEffect(() => {
    // Пользователь отлистал вверх читать историю — вид не дёргаем (T-16).
    if (!isNearBottomRef.current) return
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, isStreaming])

  return (
    <div className="chat-window" ref={containerRef} onScroll={handleScroll}>
      <MessageList messages={messages} isStreaming={isStreaming} />
      {/* «Маяк» в конце списка — цель доскролла к свежему сообщению. */}
      <div className="chat-window__end" ref={endRef} />
    </div>
  )
}
