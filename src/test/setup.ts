/**
 * Настройка тестового окружения (T-11): файл подключён через `test.setupFiles` в vite.config.ts.
 * Выполняется перед каждым тестовым файлом (Vitest + jsdom).
 *
 * Что делает: регистрирует jest-dom-матчеры (`toBeInTheDocument`, `toBeDisabled`, …) и вручную
 * чистит DOM после каждого теста — RTL не делает этого автоматически, потому что `globals`
 * в конфиге не включены. Тесты офлайн: сеть и `localStorage` в них мокаются (NFR-01).
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Без этой чистки разметка предыдущего теста остаётся в document.body и ломает queries следующего.
afterEach(() => {
  cleanup()
})
