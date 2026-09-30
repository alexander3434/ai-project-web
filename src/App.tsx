import { ChatInput } from './components/ChatInput'
import { ChatWindow } from './components/ChatWindow'
import { ModelSelector } from './components/ModelSelector'
import { useChat } from './hooks/useChat'

/** The chat screen: title, provider selector, conversation, input — all fed by one hook. */
function App() {
  const { messages, model, setModel, isStreaming, send } = useChat()

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Ai-Turbo Chat</h1>
        <ModelSelector model={model} onChange={setModel} />
      </header>
      <main className="app__main">
        <ChatWindow messages={messages} isStreaming={isStreaming} />
        <ChatInput disabled={isStreaming} onSend={send} />
      </main>
    </div>
  )
}

export default App
