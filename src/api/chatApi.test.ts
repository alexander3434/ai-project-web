/**
 * T-13: клиент `POST /chat`. Тесты офлайн: `fetch` подменяется, поток ответа собирается
 * из `ReadableStream` вручную — сеть и бэкенд не нужны (NFR-01).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, ChatRequestError, streamChat } from './chatApi'
import type { ChatRequest } from './chatApi'

/** Простейший запрос: один ход пользователя и явная модель. */
const request: ChatRequest = {
  messages: [{ role: 'user', content: 'Какая сейчас погода в Москве?' }],
  model: 'local',
}

const encoder = new TextEncoder()
const fetchMock = vi.fn<typeof fetch>()

/** Ответ 200 text/event-stream, чьё тело отдаётся переданными кусками. */
function sseResponse(chunks: Array<string | Uint8Array>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('streamChat', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('шлёт POST с историей, моделью, Accept и signal', async () => {
    fetchMock.mockResolvedValue(sseResponse(['event: done\ndata: {"answer":"ок"}\n\n']))
    const controller = new AbortController()

    await expect(streamChat(request, vi.fn(), controller.signal)).resolves.toBe('ок')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/chat`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    })
    expect(init?.body).toBe(JSON.stringify(request))
    expect(init?.signal).toBe(controller.signal)
  })

  it('вызывает onChunk по разу на кадр, по порядку, и резолвится текстом done.answer', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'event: chunk\ndata: {"text":"Сейчас "}\n\n',
        'event: chunk\ndata: {"text":"в Москве "}\n\n',
        'event: chunk\ndata: {"text":"+15°C"}\n\n',
        'event: done\ndata: {"answer":"Сейчас в Москве +15°C"}\n\n',
      ]),
    )
    const onChunk = vi.fn()

    await expect(streamChat(request, onChunk)).resolves.toBe('Сейчас в Москве +15°C')
    expect(onChunk.mock.calls).toEqual([['Сейчас '], ['в Москве '], ['+15°C']])
  })

  it('декодирует кириллицу, разрезанную по байтам', async () => {
    const bytes = encoder.encode(
      'event: chunk\ndata: {"text":"Москва"}\n\nevent: done\ndata: {"answer":"Москва"}\n\n',
    )
    // Разрез внутри двухбайтового символа «М»: без {stream: true} он превратился бы в мусор.
    const cut = encoder.encode('event: chunk\ndata: {"text":"М').length - 1
    fetchMock.mockResolvedValue(sseResponse([bytes.slice(0, cut), bytes.slice(cut)]))
    const onChunk = vi.fn()

    await expect(streamChat(request, onChunk)).resolves.toBe('Москва')
    expect(onChunk).toHaveBeenCalledWith('Москва')
  })

  it('разбирает пред-стримовый 400: текст ошибки из JSON и статус', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Field 'messages' must not be empty" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const error = await streamChat(request, vi.fn()).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ChatRequestError)
    expect(error).toMatchObject({
      name: 'ChatRequestError',
      message: "Field 'messages' must not be empty",
      status: 400,
    })
  })

  it('берёт статус-текст, если тело пред-стримовой ошибки не JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    )

    await expect(streamChat(request, vi.fn())).rejects.toMatchObject({
      message: 'Bad Gateway',
      status: 502,
    })
  })

  it('отвергает ответ не text/event-stream', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ answer: 'ок' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(streamChat(request, vi.fn())).rejects.toMatchObject({
      message: 'Неожиданный ответ сервера',
    })
  })

  it('превращает error-кадр в ChatRequestError со статусом', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'event: chunk\ndata: {"text":"Сейчас "}\n\n',
        'event: error\ndata: {"status":503,"error":"LLM provider is unavailable"}\n\n',
      ]),
    )
    const onChunk = vi.fn()

    await expect(streamChat(request, onChunk)).rejects.toMatchObject({
      name: 'ChatRequestError',
      message: 'LLM provider is unavailable',
      status: 503,
    })
    expect(onChunk).toHaveBeenCalledWith('Сейчас ')
  })

  it('падает с «Соединение прервано», если поток закрылся без терминального кадра', async () => {
    fetchMock.mockResolvedValue(sseResponse(['event: chunk\ndata: {"text":"начало"}\n\n']))

    await expect(streamChat(request, vi.fn())).rejects.toMatchObject({
      message: 'Соединение прервано',
      status: undefined,
    })
  })

  it('пробрасывает сбой сети как есть, не оборачивая в ChatRequestError', async () => {
    const abortError = new DOMException('Отменено', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    const error = await streamChat(request, vi.fn()).catch((reason: unknown) => reason)
    expect(error).toBe(abortError)
    expect(error).not.toBeInstanceOf(ChatRequestError)
  })
})
