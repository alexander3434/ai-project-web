import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModelSelector } from './ModelSelector'

describe('ModelSelector', () => {
  it('shows the current model and both options', () => {
    render(<ModelSelector model="deepseek" onChange={vi.fn()} />)

    const select = screen.getByLabelText('Модель')
    expect(select).toHaveValue('deepseek')
    expect(screen.getByRole('option', { name: 'local' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'deepseek' })).toBeInTheDocument()
  })

  it('reports the chosen model', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModelSelector model="deepseek" onChange={onChange} />)

    await user.selectOptions(screen.getByLabelText('Модель'), 'local')

    expect(onChange).toHaveBeenCalledExactlyOnceWith('local')
  })
})
