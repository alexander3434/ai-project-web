import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatRequest } from '../api/chatApi'
import { streamChat } from '../api/chatApi'
import type { ChatMessage, MessageRole, ModelChoice } from '../types'
import { loadMessages, saveMessages } from './chatStorage'

/** The error entry shown when the failure carries no usable wording. */
const FALLBACK_ERROR = 'Не удалось получить ответ'

function errorText(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  return FALLBACK_ERROR
}

export type ChatController = {
  messages: ChatMessage[]
  model: ModelChoice
  setModel: (model: ModelChoice) => void
  isStreaming: boolean
  send: (text: string) => void
}

/**
 * The single owner of the conversation. It restores the history from
 * localStorage, appends the user turn at once, streams the answer into a
 * placeholder assistant message, replaces it with an error entry on failure
 * (the history stays intact), persists every change and aborts an in-flight
 * request on unmount. The model choice is not persisted (D-17).
 */
export function useChat(): ChatController {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages())
  const [model, setModel] = useState<ModelChoice>('deepseek')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesRef = useRef(messages)
  const streamingRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesRef.current = messages
    saveMessages(messages)
  }, [messages])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  const send = useCallback(
    (text: string) => {
      const content = text.trim()
      if (content === '' || streamingRef.current) return

      const userMessage: ChatMessage = { id: crypto.randomUUID(), kind: 'user', content }
      const assistantId = crypto.randomUUID()
      const conversation = [...messagesRef.current, userMessage]
      const request: ChatRequest = {
        messages: conversation
          .filter((message): message is ChatMessage & { kind: MessageRole } => message.kind !== 'error')
          .map((message) => ({ role: message.kind, content: message.content })),
        model,
      }

      streamingRef.current = true
      setIsStreaming(true)
      setMessages([...conversation, { id: assistantId, kind: 'assistant', content: '' }])

      const controller = new AbortController()
      controllerRef.current = controller

      void streamChat(
        request,
        (piece) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + piece } : message,
            ),
          )
        },
        controller.signal,
      )
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setMessages((current) => [
            ...current.filter((message) => message.id !== assistantId),
            { id: crypto.randomUUID(), kind: 'error', content: errorText(error) },
          ])
        })
        .finally(() => {
          streamingRef.current = false
          setIsStreaming(false)
          if (controllerRef.current === controller) controllerRef.current = null
        })
    },
    [model],
  )

  return { messages, model, setModel, isStreaming, send }
}
