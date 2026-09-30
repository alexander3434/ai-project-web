/**
 * Список сообщений (T-16, FR-02/FR-05/FR-07).
 *
 * Ответственность: разложить массив сообщений по презентационным компонентам и показать индикатор
 * активности, пока идёт генерация. Состояния не держит.
 *
 * Разметка и доступность:
 *   - корень — `role="log"` + `aria-live="polite"` (скринридер объявляет новые сообщения, не
 *     перебивая пользователя);
 *   - `kind: 'user' | 'assistant'` → `./MessageBubble` (ключ — `message.id`);
 *   - `kind: 'error'` → `./ErrorBanner` (та же позиция в списке, отдельный вид);
 *   - пока `isStreaming` — индикатор активности (`role="status"`, текст «Ассистент печатает…»,
 *     класс `typing-indicator`), который относится именно к последнему, ещё пустому ответу
 *     ассистента; после терминального кадра индикатор исчезает (FR-05);
 *   - пустой список (новый сеанс) — пустой контейнер без заглушек-сообщений.
 *
 * Взаимодействие: вызывается из `./ChatWindow`; классы — `message-list`, `typing-indicator`
 * (см. index.css).
 */

import type { ReactElement } from 'react'
import type { ChatMessage } from '../types'
import { MessageBubble } from './MessageBubble'
import { ErrorBanner } from './ErrorBanner'

/** Пропсы: список сообщений и признак активного запроса. */
export interface MessageListProps {
  /** Сообщения в порядке разговора; записи `error` рендерит `ErrorBanner`, остальные — `MessageBubble`. */
  messages: ChatMessage[]
  /** `true` — рендерится индикатор «Ассистент печатает…» для текущего ответа. */
  isStreaming: boolean
}

/** Список сообщений с индикатором активности; в скелете — без разметки. */
export function MessageList({ messages, isStreaming }: MessageListProps): ReactElement | null {
  return (
    <div className="message-list" role="log" aria-live="polite">
      {messages.map((message) =>
        message.kind === 'error' ? (
          <ErrorBanner key={message.id} message={message} />
        ) : (
          <MessageBubble key={message.id} message={message} />
        ),
      )}

      {isStreaming ? (
        <div className="typing-indicator" role="status">
          <span className="typing-indicator__dot" />
          <span className="typing-indicator__dot" />
          <span className="typing-indicator__dot" />
          <span>Ассистент печатает…</span>
        </div>
      ) : null}
    </div>
  )
}
