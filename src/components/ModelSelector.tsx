/**
 * Выбор провайдера на запрос (T-17, FR-06).
 *
 * Ответственность: показать текущую модель и сообщить о смене наверх; собственного состояния не
 * держит — это controlled-компонент (`value` + `onChange`), источник правды — `useChat`.
 *
 * Разметка и поведение:
 *   - `<label className="model-selector__label" htmlFor={SELECT_ID}>Модель</label>` и
 *     `<select className="model-selector__select" id={SELECT_ID}>`;
 *   - два `<option>`: `deepseek` (показывается как «DeepSeek», значение `"deepseek"`) и
 *     `local` (значение `"local"`, подпись — «Локальная (Ollama)»); значение селекта = `model`;
 *   - дефолт `deepseek` приходит из `useChat` (`DEFAULT_MODEL`), здесь дублировать его не нужно;
 *   - `onChange`: значение DOM-строки сужается до `ModelChoice` явной проверкой
 *     (`value === 'local' ? 'local' : 'deepseek'`), без `as`-каста (CODE_STYLE.md: без `any`);
 *   - смена модели во время стрима разрешена и влияет только на следующий запрос — текущий
 *     ответ продолжает идти с моделью, выбранной в момент отправки;
 *   - выбор не сохраняется между перезагрузками (D-17): после reload снова `deepseek`.
 *
 * Взаимодействие: рендерится в шапке `App.tsx`, пропсы — `model`/`setModel` из `useChat`.
 */

import type { ReactElement } from 'react'
import type { ModelChoice } from '../types'

/** id селекта для связи `<label htmlFor>` и `<select id>`. */
export const MODEL_SELECT_ID = 'model-selector'

/** Пропсы: текущая модель и колбэк смены. */
export interface ModelSelectorProps {
  /** Текущая модель; уходит полем `model` в каждый следующий запрос. */
  model: ModelChoice
  /** Вызывается с новым значением при выборе в `<select>`. */
  onChange: (model: ModelChoice) => void
}

/** Селектор модели `local`/`deepseek`; в скелете — без разметки. */
export function ModelSelector({ model, onChange }: ModelSelectorProps): ReactElement | null {
  return (
    <div className="model-selector">
      <label className="model-selector__label" htmlFor={MODEL_SELECT_ID}>
        Модель
      </label>
      <select
        className="model-selector__select"
        id={MODEL_SELECT_ID}
        value={model}
        onChange={(event) => {
          // Сужение DOM-строки до ModelChoice без `as`-каста: всё, кроме local, — дефолтный deepseek.
          onChange(event.target.value === 'local' ? 'local' : 'deepseek')
        }}
      >
        <option value="deepseek">DeepSeek</option>
        <option value="local">Локальная (Ollama)</option>
      </select>
    </div>
  )
}
