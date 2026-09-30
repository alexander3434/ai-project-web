/**
 * Клиент бэка для чата (`src/api/chatApi.ts` в 02-design.md): один POST на /chat и разбор
 * SSE-потока ответа. Единственное место фронтенда, которое знает про сеть; HTTP-библиотек нет —
 * только `fetch` (CODE_STYLE.md), поэтому поток читается через `ReadableStream` (EventSource
 * не умеет POST).
 *
 * Взаимодействие:
 *   - `hooks/useChat.ts` — единственный вызывающий: передаёт полную историю сессии, получает куски
 *     ответа через `onChunk` и финальный текст из промиса;
 *   - `api/sse.ts` — парсер кадров, которыми нарезан поток;
 *   - `types.ts` — формы сообщений и модели.
 *
 * Безопасность (FR-08/NFR-03): ни ключей, ни паролей, ни токенов; адрес бэка — одна константа
 * `API_BASE_URL`, в dev она пустая и запрос уходит на относительный `/chat` через прокси Vite.
 */

import type { MessageRole, ModelChoice } from '../types'
import { createSseParser } from './sse'

/**
 * Адрес бэка — единственная константа конфигурации (FR-08, ASM-07).
 * В dev `VITE_API_BASE_URL` не задан → пустая строка → запрос идёт на относительный `/chat`,
 * который `vite.config.ts` проксирует на http://localhost:8080 (CORS не нужен). Вне dev —
 * значение по умолчанию http://localhost:8080 или явный `VITE_API_BASE_URL` (split-origin, вне v1).
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:8080')

/** Сообщение «на проводе»: ровно то, что принимает POST /chat — без id/kind (FR-04). */
export interface ChatRequestMessage {
  /** `user` или `assistant`; `error`-записи в тело запроса не попадают никогда. */
  role: MessageRole
  /** Текст сообщения без локальных полей (таймстемпов и т.п. во фронте нет вовсе). */
  content: string
}

/** Тело POST /chat: полная история сессии в порядке разговора плюс выбранная модель (FR-04, FR-06). */
export interface ChatRequest {
  /** Вся история, заканчивающаяся только что отправленным сообщением пользователя. */
  messages: ChatRequestMessage[]
  /** Всегда отправляется (не `undefined`): бэк трактует отсутствие/пустое как `deepseek`. */
  model: ModelChoice
}

/**
 * Ошибка обращения к бэку — единственный тип ошибки, который видит useChat.
 * Используется для всех веток: пред-стримовые 400/503, неподходящий content-type, `error`-кадр,
 * обрыв потока без терминального кадра; сетевые сбои `fetch` уходят наверх как есть (TypeError).
 */
export class ChatRequestError extends Error {
  /** HTTP-статус ответа, если ошибка пришла от бэка; `undefined` — сеть/обрыв/формат. */
  readonly status?: number

  /**
   * Сохраняет текст ошибки (сообщение бэка из JSON `{error}` или локальный текст) и HTTP-статус.
   * Побочные эффекты: вызывает `super(message)`, выставляет `name = 'ChatRequestError'` и
   * `status`; поле `status` — единственный публичный атрибут, никаких данных запроса в ошибке нет
   * (NFR-03: тело истории в текст ошибки не попадает).
   */
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ChatRequestError'
    this.status = status
  }
}

/**
 * Отправляет историю на `POST ${API_BASE_URL}/chat` и отдаёт ответ по мере генерации (FR-05, FR-10).
 *
 * Контракт:
 *   - запрос: метод POST, заголовки `Content-Type: application/json` и `Accept: text/event-stream`,
 *     тело `JSON.stringify(request)` (ровно `{messages, model}`), `signal` — для отмены;
 *   - `!response.ok`: тело — JSON `{error}` (пред-стримовые 400/503, стрим не открывался); читаем его
 *     и бросаем `ChatRequestError(error, response.status)`; не-JSON тело → запасной `response.statusText`;
 *   - `content-type` ответа не `text/event-stream` → `ChatRequestError('Неожиданный ответ сервера')`
 *     (страховка от JSON-ответа или заглушки прокси);
 *   - поток: `response.body.getReader()` + `TextDecoder('utf-8')` с `{stream: true}` (кириллица,
 *     разрезанная по байтам, декодируется корректно) → куски уходят в `createSseParser()`;
 *     `chunk` → `onChunk(text)` ровно один вызов на кадр, без батчинга (NFR-05b);
 *     `done` → resolve со значением `answer`;
 *     `error` → throw `ChatRequestError(error, status)`;
 *   - поток закрылся без терминального кадра → `ChatRequestError('Соединение прервано')` (NFR-05d).
 *
 * Побочные эффекты: один сетевой запрос; `onChunk` вызывается синхронно по мере прихода кадров;
 * ничего не пишет в localStorage и в консоль. Отмена по `signal` (AbortError) пробрасывается наверх
 * как есть — useChat по ней ошибку в список не добавляет. История при любой ошибке остаётся у
 * вызывающей стороны (FR-07).
 *
 * @param request тело запроса: полная история сессии + модель (уже без локальных полей)
 * @param onChunk получатель каждого куска текста ответа в порядке прихода
 * @param signal необязательный AbortSignal для отмены запроса (размонтирование useChat)
 * @returns полный текст ответа — значение терминального кадра `done.answer`
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

  // Пред-стримовые ошибки (400/503) приходят обычным JSON: читаем текст и статус.
  if (!response.ok) {
    throw new ChatRequestError(await readErrorMessage(response), response.status)
  }

  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    throw new ChatRequestError('Неожиданный ответ сервера')
  }

  if (response.body === null) {
    throw new ChatRequestError('Соединение прервано')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = createSseParser()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      // `{stream: true}`: кириллица, разрезанная по байтам, декодируется корректно.
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.event === 'chunk') {
          const text = readFrameField(event.data, 'text')
          if (typeof text === 'string') onChunk(text)
        } else if (event.event === 'done') {
          const answer = readFrameField(event.data, 'answer')
          if (typeof answer !== 'string') throw new ChatRequestError('Неожиданный ответ сервера')
          return answer
        } else if (event.event === 'error') {
          const error = readFrameField(event.data, 'error')
          const status = readFrameField(event.data, 'status')
          throw new ChatRequestError(
            typeof error === 'string' && error !== '' ? error : 'Ошибка потока ответа',
            typeof status === 'number' ? status : undefined,
          )
        }
      }
    }

    // Поток закончился, а терминального кадра не было — ответ нельзя считать полученным.
    throw new ChatRequestError('Соединение прервано')
  } finally {
    await cancelQuietly(reader)
  }
}

/** Закрывает поток ответа, не подменяя исходную ошибку сбоем отмены. */
async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel()
  } catch {
    // поток уже закрыт или отменён — здесь нечего сообщать вызывающей стороне
  }
}

/**
 * Достаёт поле из разобранного JSON; `undefined`, если это не объект или поля нет.
 * Используется только на недоверенных данных (тело ответа), поэтому не бросает.
 */
function readField(payload: unknown, field: string): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  // Сужение до Record<string, unknown> безопасно: проверено «объект и не массив и не null».
  return (payload as Record<string, unknown>)[field]
}

/** Разбирает payload SSE-кадра и достаёт поле; не-JSON кадр → `undefined`. */
function readFrameField(data: string, field: string): unknown {
  try {
    return readField(JSON.parse(data), field)
  } catch {
    return undefined
  }
}

/** Текст ошибки из JSON `{error}`; не-JSON тело → статус-текст ответа. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const error = readField(await response.json(), 'error')
    if (typeof error === 'string' && error !== '') return error
  } catch {
    // тело не JSON — падаем на статус-текст ниже
  }
  return response.statusText !== '' ? response.statusText : `HTTP ${response.status}`
}
