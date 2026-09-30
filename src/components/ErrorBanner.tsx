/**
 * Представление ошибки хода (T-16, FR-07).
 *
 * Ответственность: показать запись `kind: 'error'` из списка сообщений так, чтобы её нельзя было
 * спутать с ответом ассистента: отдельный класс и `role="alert"` (скринридер объявляет ошибку
 * немедленно, в отличие от `role="log"` у списка).
 *
 * Поведение и краевые случаи:
 *   - рендерит только текст `message.content` (сообщение бэка, например «DeepSeek API key is not
 *     configured», или локальный текст вроде «Соединение прервано»);
 *   - никаких кнопок «повторить» — автоматических ретраев в v1 нет (ASM-11): пользователь
 *     отправляет сообщение заново вручную;
 *   - ошибка в списке — обычная запись: она остаётся видимой после перезагрузки (персистится вместе
 *     с историей), но никогда не уходит в тело запроса (её отфильтровывает `useChat`).
 *
 * Взаимодействие: вызывается из `./MessageList` для сообщений с `kind: 'error'`; классы —
 * `message message--error` (см. index.css).
 */

import type { ReactElement } from 'react'
import type { ChatMessage } from '../types'

/** Пропсы: запись об ошибке (ожидаемый `kind` — `error`). */
export interface ErrorBannerProps {
  /** Сообщение с `kind: 'error'`; `content` — текст ошибки для показа. */
  message: ChatMessage
}

/** Строка ошибки в списке сообщений; в скелете — без разметки. */
export function ErrorBanner({ message }: ErrorBannerProps): ReactElement | null {
  // role="alert" объявляет ошибку немедленно — в отличие от role="log" у списка (FR-07).
  return (
    <div className="message message--error" role="alert">
      {message.content}
    </div>
  )
}
