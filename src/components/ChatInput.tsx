/**
 * Поле ввода и отправка реплики (T-17, FR-02).
 *
 * Ответственность: собрать текст и отдать его наверх через `onSend`; собственная логика ограничена
 * локальным состоянием строки ввода. Отправку, историю и стрим держит `useChat`.
 *
 * Разметка и поведение:
 *   - `<form className="chat-input">` с одним `<input className="chat-input__field">` и кнопкой
 *     отправки `<button type="submit" className="chat-input__send">`; отправка формы даёт Enter
 *     «бесплатно» (без ручного keydown); текст кнопки — «Отправить»;
 *   - подпись поля — `<label className="chat-input__label">` с классом `visually-hidden`
 *     (или `aria-label`), чтобы поле было доступно скринридеру; плейсхолдер — подсказка про вопрос;
 *   - локальное состояние: `value` (строка ввода) через `useState`, ref на `<input>` для возврата
 *     фокуса после отправки;
 *   - `canSend = value.trim().length > 0 && !isStreaming`: пустой/пробельный ввод отправить нельзя
 *     (кнопка `disabled`, submit — no-op), во время стрима поле и кнопка `disabled` (FR-02, T-17);
 *   - `submit`: `onSend(value.trim())`, очистка поля, возврат фокуса в input — можно печатать
 *     следующую реплику сразу;
 *   - ввод не блокируется по длине и не обрезается; переводы строк не поддерживаются (однострочный
 *     input — rich/multiline ввод вне объёма).
 *
 * Взаимодействие: вызывается из `App.tsx`, который передаёт `send` из `useChat` и `isStreaming`.
 */

import type { FormEvent, ReactElement } from 'react'
import { useRef, useState } from 'react'

/** id поля для связи `<label htmlFor>` и `<input id>` (доступность, T-17). */
const INPUT_ID = 'chat-input-field'

/** Пропсы: колбэк отправки и признак активного запроса. */
export interface ChatInputProps {
  /** Вызывается с обрезанным непустым текстом; состояние чата меняет вызывающая сторона (useChat). */
  onSend: (text: string) => void
  /** `true` — поле и кнопка заблокированы, пока не пришёл терминальный кадр. */
  isStreaming: boolean
}

/** Поле ввода с кнопкой отправки; в скелете — без разметки. */
export function ChatInput({ onSend, isStreaming }: ChatInputProps): ReactElement | null {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Пустой/пробельный ввод и активный стрим отправлять нельзя (FR-02, T-17).
  const canSend = value.trim().length > 0 && !isStreaming

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault() // отправка формы не должна перезагружать страницу
    if (!canSend) return

    onSend(value.trim())
    setValue('')
    inputRef.current?.focus() // можно печатать следующую реплику сразу
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <label className="chat-input__label visually-hidden" htmlFor={INPUT_ID}>
        Сообщение
      </label>
      <input
        id={INPUT_ID}
        ref={inputRef}
        className="chat-input__field"
        type="text"
        value={value}
        placeholder="Спросите о погоде или о проливе…"
        autoComplete="off"
        disabled={isStreaming}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="chat-input__send" disabled={!canSend}>
        Отправить
      </button>
    </form>
  )
}
