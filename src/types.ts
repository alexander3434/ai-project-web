export type MessageRole = 'user' | 'assistant'

export type MessageKind = MessageRole | 'error'

export type ChatMessage = { id: string; kind: MessageKind; content: string }

export type ModelChoice = 'local' | 'deepseek'
