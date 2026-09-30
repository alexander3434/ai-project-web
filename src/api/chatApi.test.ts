import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from './chatApi'
import { API_BASE_URL, ChatRequestError, streamChat } from './chatApi'

const request: ChatRequest = {
  messages: [{ role: 'user', content: 'Какая сейчас погода в Москве?' }],
  model: 'deepseek',
}

const chunk = (text: string) => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`
const done = (answer: string, model = 'deepseek') =>
  `event: done\ndata: ${JSON.stringify({ answer, model })}\n\n`
const errorFrame = (status: number, error: string) =>
  `event: error\ndata: ${JSON.stringify({ status, error })}\n\n`

const encoder = new TextEncoder()

function streamResponse(chunks: (string | Uint8Array)[], contentType = 'text/event-stream'): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of chunks) {
        controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece)
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': contentType } })
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('API_BASE_URL', () => {
  it('is empty in dev (the Vite proxy)', () => {
    expect(API_BASE_URL).toBe('')
  })

  it('uses VITE_API_BASE_URL when it is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.example.test')
    vi.resetModules()

    const module = await import('./chatApi')

    expect(module.API_BASE_URL).toBe('http://api.example.test')
  })

  it('falls back to localhost:8080 in a production build', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()

    const module = await import('./chatApi')

    expect(module.API_BASE_URL).toBe('http://localhost:8080')
  })
})

describe('streamChat', () => {
  it('posts the request as JSON and asks for the event stream', async () => {
    const fetchMock = mockFetch(streamResponse([done('готово')]))

    await streamChat(request, () => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/chat')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    })
    expect(init?.body).toBe(JSON.stringify(request))
  })

  it('passes the abort signal through', async () => {
    const fetchMock = mockFetch(streamResponse([done('готово')]))
    const controller = new AbortController()

    await streamChat(request, () => {}, controller.signal)

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('delivers every chunk once, in order, and resolves with the done answer', async () => {
    const pieces = ['Сейчас ', 'в Москве ', '+15.4°C, облачно']
    const onChunk = vi.fn()
    mockFetch(streamResponse([...pieces.map(chunk), done(pieces.join(''))]))

    await expect(streamChat(request, onChunk)).resolves.toBe('Сейчас в Москве +15.4°C, облачно')

    expect(onChunk.mock.calls.map(([text]) => text)).toEqual(pieces)
  })

  it('decodes a Cyrillic payload split across byte chunks', async () => {
    const payload = encoder.encode(chunk('Москва +15.4°C') + done('Москва +15.4°C'))
    const onChunk = vi.fn()
    mockFetch(streamResponse([payload.slice(0, 17), payload.slice(17)]))

    await expect(streamChat(request, onChunk)).resolves.toBe('Москва +15.4°C')

    expect(onChunk).toHaveBeenCalledExactlyOnceWith('Москва +15.4°C')
  })

  it('throws the backend wording for a pre-stream JSON error', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: 'DeepSeek API key is not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const failure = await streamChat(request, () => {}).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ChatRequestError)
    expect((failure as ChatRequestError).message).toBe('DeepSeek API key is not configured')
    expect((failure as ChatRequestError).status).toBe(503)
  })

  it('falls back to the status text when the error body is not JSON', async () => {
    mockFetch(new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }))

    const failure = (await streamChat(request, () => {}).catch((error: unknown) => error)) as ChatRequestError

    expect(failure.message).toBe('Bad Gateway')
    expect(failure.status).toBe(502)
  })

  it('rejects a non-event-stream success response', async () => {
    mockFetch(new Response('{"answer":"нет"}', { headers: { 'Content-Type': 'application/json' } }))

    const failure = (await streamChat(request, () => {}).catch((error: unknown) => error)) as ChatRequestError

    expect(failure.message).toBe('Неожиданный ответ сервера')
    expect(failure.status).toBeUndefined()
  })

  it('throws the error frame payload with its status', async () => {
    mockFetch(
      streamResponse([chunk('Сейчас '), errorFrame(503, 'LLM provider is unavailable')]),
    )

    const failure = (await streamChat(request, () => {}).catch((error: unknown) => error)) as ChatRequestError

    expect(failure.message).toBe('LLM provider is unavailable')
    expect(failure.status).toBe(503)
  })

  it('throws "Соединение прервано" when the stream ends without a terminal frame', async () => {
    mockFetch(streamResponse([chunk('Сейчас ')]))

    const failure = (await streamChat(request, () => {}).catch((error: unknown) => error)) as ChatRequestError

    expect(failure.message).toBe('Соединение прервано')
  })
})
