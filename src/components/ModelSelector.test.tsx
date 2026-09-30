/**
 * T-17: селектор модели `local`/`deepseek` — controlled-компонент без собственного состояния.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModelSelector } from './ModelSelector'

/** Значения и подписи опций в порядке отрисовки. */
function options(select: HTMLElement): Array<{ value: string; label: string | null }> {
  return Array.from(select.querySelectorAll('option')).map((option) => ({
    value: option.value,
    label: option.textContent,
  }))
}

describe('ModelSelector', () => {
  it('показывает переданную модель и обе опции', () => {
    render(<ModelSelector model="deepseek" onChange={vi.fn()} />)

    const select = screen.getByLabelText('Модель')
    expect(select).toHaveClass('model-selector__select')
    expect(select).toHaveValue('deepseek')
    expect(options(select)).toEqual([
      { value: 'deepseek', label: 'DeepSeek' },
      { value: 'local', label: 'Локальная (Ollama)' },
    ])
  })

  it('связывает подпись с селектом', () => {
    render(<ModelSelector model="deepseek" onChange={vi.fn()} />)

    const label = screen.getByText('Модель')
    expect(label).toHaveClass('model-selector__label')
    expect(label).toHaveAttribute('for', screen.getByLabelText('Модель').id)
  })

  it('отдаёт выбранную модель наверх', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelSelector model="deepseek" onChange={onChange} />)

    await user.selectOptions(screen.getByLabelText('Модель'), 'local')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('local')
  })

  it('показывает модель local, когда она выбрана', () => {
    render(<ModelSelector model="local" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Модель')).toHaveValue('local')
  })
})
