import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../types'
import { loadMessages, saveMessages } from './chatStorage'

const KEY = 'ai-turbo-chat-history'

const conversation: ChatMessage[] = [
  { id: '1', kind: 'user', content: 'Какая погода в Москве?' },
  { id: '2', kind: 'assistant', content: 'Сейчас +15.4°C, облачно.' },
  { id: '3', kind: 'error', content: 'LLM provider is unavailable' },
]

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('chatStorage', () => {
  it('round-trips a conversation in order', () => {
    saveMessages(conversation)

    expect(loadMessages()).toEqual(conversation)
  })

  it('writes only the chat-history key', () => {
    saveMessages(conversation)

    expect(Object.keys(localStorage)).toEqual([KEY])
  })

  it('reads an empty list when the key is missing', () => {
    expect(loadMessages()).toEqual([])
  })

  it('reads an empty list when the stored JSON is corrupted', () => {
    localStorage.setItem(KEY, '{not json')

    expect(loadMessages()).toEqual([])
  })

  it('reads an empty list when the stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ messages: conversation }))

    expect(loadMessages()).toEqual([])
  })

  it('keeps the valid entries in order and drops the invalid ones', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        conversation[0],
        { id: 'x', kind: 'user' },
        null,
        { id: 'y', kind: 'system', content: 'нет' },
        { id: 'z', kind: 'assistant', content: 42 },
        'строка',
        conversation[2],
      ]),
    )

    expect(loadMessages()).toEqual([conversation[0], conversation[2]])
  })

  it('never throws when reading the store throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('security error')
    })

    expect(loadMessages()).toEqual([])
  })

  it('never throws when writing the store throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => saveMessages(conversation)).not.toThrow()
  })
})
