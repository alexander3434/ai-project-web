/**
 * Композиция экрана чата (T-18, FR-01/FR-02/FR-08).
 *
 * Ответственность: собрать шапку (заголовок + выбор модели), окно переписки и поле ввода, связав их
 * единственным источником состояния — хуком `useChat`. Своей логики и своего состояния у App нет.
 *
 * Разметка:
 *   - `<div className="app">` — колонка на всю высоту;
 *   - `<header className="app__header">`: `<h1 className="app__title">Ai-Turbo Chat</h1>` и
 *     `./ModelSelector` с пропсами `model` / `onChange={setModel}`;
 *   - `<main className="app__main">`: `./ChatWindow` (`messages`, `isStreaming`) и
 *     `./ChatInput` (`onSend={send}`, `isStreaming` — блокировка ввода до конца ответа);
 *   - состояние только из `useChat()`: `{ messages, model, setModel, isStreaming, send }`;
 *     ничего не персистит и не ходит в сеть само — это делает хук.
 *
 * Взаимодействие: монтируется из `main.tsx`; классы — `app`, `app__header`, `app__title`,
 * `app__main` (см. index.css).
 */

import type { ReactElement } from 'react'
import { useChat } from './hooks/useChat'
import { ChatWindow } from './components/ChatWindow'
import { ChatInput } from './components/ChatInput'
import { ModelSelector } from './components/ModelSelector'

/** Корневой компонент приложения; в скелете — без разметки. */
export function App(): ReactElement | null {
  const { messages, model, setModel, isStreaming, send } = useChat()

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Ai-Turbo Chat</h1>
        <ModelSelector model={model} onChange={setModel} />
      </header>

      <main className="app__main">
        <ChatWindow messages={messages} isStreaming={isStreaming} />
        <ChatInput onSend={send} isStreaming={isStreaming} />
      </main>
    </div>
  )
}
