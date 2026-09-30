import type { ChatMessage, MessageKind } from '../types'

/** The only localStorage key the app owns (CODE_STYLE.md). */
const STORAGE_KEY = 'ai-turbo-chat-history'

const KINDS: readonly string[] = ['user', 'assistant', 'error']

function isKind(value: unknown): value is MessageKind {
  return typeof value === 'string' && KINDS.includes(value)
}

/** Drops anything that is not a complete message: a corrupted entry never breaks the chat. */
function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && isKind(entry.kind) && typeof entry.content === 'string'
}

/** The stored conversation, in order; an absent, unreadable or corrupted store reads as empty. */
export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isMessage)
  } catch {
    return []
  }
}

/** Persists the conversation in order; a quota or disabled-storage error is swallowed. */
export function saveMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // The chat keeps working in memory when the browser refuses to store.
  }
}
