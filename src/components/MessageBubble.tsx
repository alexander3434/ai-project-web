/**
 * Пузырь одного сообщения (T-16, FR-02).
 *
 * Ответственность: показать текст одной реплики (`user` или `assistant`) без какой-либо логики.
 * Текст рендерится как обычный текст (никакого markdown/HTML/`dangerouslySetInnerHTML` —
 * out of scope, rich content не поддерживается), переносы строк сохраняются средствами CSS.
 *
 * Вид и доступность:
 *   - `aria-label="Сообщение пользователя"` для `kind: 'user'` и `"Ответ ассистента"` для
 *     `kind: 'assistant'`;
 *   - классы: `message message--user` / `message message--assistant`, текст — `message__text`
 *     (см. index.css);
 *   - пустой `content` (плейсхолдер во время стрима) рендерится как пустой пузырь — индикатор
 *     активности показывает `./MessageList`, а не этот компонент.
 *
 * Взаимодействие: вызывается из `./MessageList` только для ролей `user`/`assistant`; записи
 * `kind: 'error'` сюда не попадают — их рендерит `./ErrorBanner`.
 */

import type { ReactElement } from 'react'
import type { ChatMessage } from '../types'

/** Пропсы: одно сообщение (ожидаемые `kind` — `user` или `assistant`). */
export interface MessageBubbleProps {
  /** Сообщение чата; для ролей `user`/`assistant` — `aria-label` и класс зависят от `kind`. */
  message: ChatMessage
}

/** Один пузырь сообщения; в скелете — без разметки. */
export function MessageBubble({ message }: MessageBubbleProps): ReactElement | null {
  const isUser = message.kind === 'user'

  return (
    <div
      className={isUser ? 'message message--user' : 'message message--assistant'}
      aria-label={isUser ? 'Сообщение пользователя' : 'Ответ ассистента'}
    >
      {/* Только текст: markdown/HTML не поддерживаются, переносы строк сохраняет CSS. */}
      <div className="message__text">{message.content}</div>
    </div>
  )
}
