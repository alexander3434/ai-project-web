import { useRef, useState } from 'react'

type ChatInputProps = {
  /** True while an answer is arriving: nothing can be sent. */
  disabled: boolean
  onSend: (text: string) => void
}

/** The message field: Enter or the button sends, blank input cannot be sent. */
export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canSend = !disabled && value.trim() !== ''

  function submit(): void {
    if (!canSend) return
    onSend(value)
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <form
      className="chat-input"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="visually-hidden" htmlFor="chat-input-field">
        Сообщение
      </label>
      <input
        id="chat-input-field"
        ref={inputRef}
        className="chat-input__field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Напишите сообщение…"
        autoComplete="off"
        disabled={disabled}
      />
      <button type="submit" className="chat-input__send" disabled={!canSend}>
        Отправить
      </button>
    </form>
  )
}
