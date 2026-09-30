import type { MessageRole, ModelChoice } from '../types'
import { createSseParser } from './sse'

/** The backend address in one place: the env override, the dev proxy (''), or the local default. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:8080')

export type ChatRequestMessage = { role: MessageRole; content: string }

export type ChatRequest = { messages: ChatRequestMessage[]; model: ModelChoice }

/** A failed chat request: the backend's wording plus the status it intended. */
export class ChatRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ChatRequestError'
    this.status = status
  }
}

type FramePayload = Record<string, unknown>

function parsePayload(data: string): FramePayload | null {
  try {
    const value: unknown = JSON.parse(data)
    return typeof value === 'object' && value !== null ? (value as FramePayload) : null
  } catch {
    return null
  }
}

function stringField(payload: FramePayload, field: string): string | null {
  const value = payload[field]
  return typeof value === 'string' ? value : null
}

async function errorFromResponse(response: Response): Promise<ChatRequestError> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const message = (body as FramePayload).error
      if (typeof message === 'string' && message !== '') {
        return new ChatRequestError(message, response.status)
      }
    }
  } catch {
    // No JSON body: the status text is the best available wording.
  }
  return new ChatRequestError(response.statusText, response.status)
}

/**
 * One turn of the chat: posts the history and streams the answer back.
 * Every `chunk` frame calls [onChunk] with its text as it arrives; the promise
 * resolves with the terminal `done` answer or rejects with a [ChatRequestError]
 * (a pre-stream HTTP failure, an `error` frame, or a stream cut before a
 * terminal frame). No state is kept here — the caller owns the conversation.
 */
export async function streamChat(
  request: ChatRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    throw await errorFromResponse(response)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('text/event-stream')) {
    throw new ChatRequestError('Неожиданный ответ сервера')
  }
  if (response.body === null) {
    throw new ChatRequestError('Соединение прервано')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = createSseParser()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      const payload = parsePayload(event.data)
      if (payload === null) continue
      if (event.event === 'chunk') {
        const text = stringField(payload, 'text')
        if (text !== null) onChunk(text)
      } else if (event.event === 'done') {
        return stringField(payload, 'answer') ?? ''
      } else if (event.event === 'error') {
        const status = payload.status
        throw new ChatRequestError(
          stringField(payload, 'error') ?? 'Неизвестная ошибка',
          typeof status === 'number' ? status : undefined,
        )
      }
    }
  }

  throw new ChatRequestError('Соединение прервано')
}
