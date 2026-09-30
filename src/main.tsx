/**
 * Точка входа приложения (T-18): монтирует `App` в `#root` из index.html.
 *
 * Здесь нет логики чата — только бутстрап React: `createRoot` + `StrictMode`
 * (двойной вызов рендера/эффектов в dev — ожидаемое поведение, состояние хука к нему устойчиво).
 * Глобальные стили подключаются один раз импортом `./index.css` (plain CSS, без фреймворков).
 * Никаких секретов и обращений к сети в этом модуле нет (FR-08/NFR-03).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// Корневой элемент задан в index.html; его отсутствие — ошибка сборки страницы, а не рантайм-кейс.
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
