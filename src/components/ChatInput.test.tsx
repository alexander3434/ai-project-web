/**
 * T-17: поле ввода и отправка. Отправка формы (кнопка или Enter), запрет пустого ввода,
 * блокировка во время стрима, возврат фокуса после отправки.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('отправляет обрезанный текст по кнопке и очищает поле, оставляя фокус', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatInput onSend={onSend} isStreaming={false} />)

    const field = screen.getByLabelText('Сообщение')
    const button = screen.getByRole('button', { name: 'Отправить' })
    expect(button).toBeDisabled()

    await user.type(field, '  Какая погода в Москве?  ')
    expect(button).toBeEnabled()

    await user.click(button)

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('Какая погода в Москве?')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('отправляет по Enter', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatInput onSend={onSend} isStreaming={false} />)

    await user.type(screen.getByLabelText('Сообщение'), 'привет{Enter}')

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('привет')
  })

  it('не отправляет пустой и пробельный ввод', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatInput onSend={onSend} isStreaming={false} />)

    const field = screen.getByLabelText('Сообщение')
    const button = screen.getByRole('button', { name: 'Отправить' })

    expect(button).toBeDisabled()
    await user.type(field, '   ')
    expect(button).toBeDisabled()

    await user.type(field, '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('блокирует поле и кнопку во время стрима', () => {
    render(<ChatInput onSend={vi.fn()} isStreaming />)

    expect(screen.getByLabelText('Сообщение')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  })

  it('держит подпись поля доступной скринридеру', () => {
    render(<ChatInput onSend={vi.fn()} isStreaming={false} />)

    const label = screen.getByText('Сообщение')
    expect(label).toHaveClass('visually-hidden')
    expect(label).toHaveAttribute('for', screen.getByLabelText('Сообщение').id)
  })

  it('не обрезает длинный ввод', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} isStreaming={false} />)

    const long = 'а'.repeat(300)
    const field = screen.getByLabelText('Сообщение')
    await user.type(field, long)

    expect(field).toHaveValue(long)
  })
})
