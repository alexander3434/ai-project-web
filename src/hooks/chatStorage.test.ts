/**
 * T-14: слой хранения истории. Тесты офлайн: настоящий jsdom-`localStorage` (сбрасывается
 * перед каждым тестом) и моки Storage.prototype на сбои чтения/записи (NFR-01, R-08).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_STORAGE_KEY, loadMessages, saveMessages } from './chatStorage'
import type { ChatMessage } from '../types'

const userMessage: ChatMessage = { id: 'u1', kind: 'user', content: 'Какая погода в Москве?' }
const assistantMessage: ChatMessage = { id: 'a1', kind: 'assistant', content: 'Облачно, +15°C' }
const errorMessage: ChatMessage = { id: 'e1', kind: 'error', content: 'Соединение прервано' }

describe('chatStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('сохраняет и читает историю в исходном порядке', () => {
    saveMessages([userMessage, assistantMessage, errorMessage])

    expect(loadMessages()).toEqual([userMessage, assistantMessage, errorMessage])
  })

  it('пишет тот же массив, что и получила, только в ключ истории', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    saveMessages([userMessage])

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith(CHAT_STORAGE_KEY, JSON.stringify([userMessage]))
    expect(localStorage.length).toBe(1)
  })

  it('сохраняет пустой список как []', () => {
    saveMessages([])

    expect(localStorage.getItem(CHAT_STORAGE_KEY)).toBe('[]')
    expect(loadMessages()).toEqual([])
  })

  it('возвращает пустую историю, если ключа нет', () => {
    expect(loadMessages()).toEqual([])
  })

  it('возвращает пустую историю на невалидном JSON', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, '{это не json')

    expect(loadMessages()).toEqual([])
  })

  it('возвращает пустую историю, если в корне не массив', () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ messages: [userMessage] }))
    expect(loadMessages()).toEqual([])

    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify('строка'))
    expect(loadMessages()).toEqual([])

    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(42))
    expect(loadMessages()).toEqual([])
  })

  it('отбрасывает невалидные записи, сохраняя валидные и их порядок', () => {
    const stored = [
      null,
      42,
      'строка',
      [],
      { id: 'u1', kind: 'user' },
      { id: 'u2', kind: 'user', content: 15 },
      { id: 3, kind: 'user', content: 'текст' },
      { id: 'x1', kind: 'system', content: 'текст' },
      userMessage,
      { id: 'u3', kind: 'user', content: 'с лишним полем', extra: true },
      errorMessage,
    ]
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored))

    // Валидная запись возвращается как есть (лишние поля не вычищаются — это дело сборки запроса).
    expect(loadMessages()).toEqual([
      userMessage,
      { id: 'u3', kind: 'user', content: 'с лишним полем', extra: true },
      errorMessage,
    ])
  })

  it('не падает, если чтение из хранилища бросает', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage отключён', 'SecurityError')
    })

    expect(loadMessages()).toEqual([])
  })

  it('не падает, если запись в хранилище бросает (квота/приватный режим)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    expect(() => saveMessages([userMessage, assistantMessage])).not.toThrow()
  })
})
