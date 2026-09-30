import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('sends the typed text on Enter, clears the field and keeps the focus', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput disabled={false} onSend={onSend} />)
    const field = screen.getByLabelText('Сообщение')

    await user.type(field, 'Какая погода в Москве?{Enter}')

    expect(onSend).toHaveBeenCalledExactlyOnceWith('Какая погода в Москве?')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('sends with the button as well', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput disabled={false} onSend={onSend} />)

    await user.type(screen.getByLabelText('Сообщение'), 'Привет')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('Привет')
  })

  it('cannot send blank or whitespace-only input', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput disabled={false} onSend={onSend} />)
    const send = screen.getByRole('button', { name: 'Отправить' })

    expect(send).toBeDisabled()

    await user.type(screen.getByLabelText('Сообщение'), '   ')
    expect(send).toBeDisabled()

    await user.type(screen.getByLabelText('Сообщение'), '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables the field and the button while an answer is streaming', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput disabled onSend={onSend} />)

    const field = screen.getByLabelText('Сообщение')
    expect(field).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()

    await user.type(field, 'Привет{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })
})
