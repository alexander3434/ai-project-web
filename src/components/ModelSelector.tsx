import type { ModelChoice } from '../types'

type ModelSelectorProps = {
  model: ModelChoice
  onChange: (model: ModelChoice) => void
}

function isModelChoice(value: string): value is ModelChoice {
  return value === 'local' || value === 'deepseek'
}

/** Chooses the provider for the next request; the state itself lives in the chat hook. */
export function ModelSelector({ model, onChange }: ModelSelectorProps) {
  return (
    <div className="model-selector">
      <label htmlFor="model-select">Модель</label>
      <select
        id="model-select"
        value={model}
        onChange={(event) => {
          if (isModelChoice(event.target.value)) onChange(event.target.value)
        }}
      >
        <option value="local">local</option>
        <option value="deepseek">deepseek</option>
      </select>
    </div>
  )
}
