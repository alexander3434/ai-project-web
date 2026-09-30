/**
 * Единственный владелец состояния чата (`src/hooks/useChat.ts` в 02-design.md, T-15).
 *
 * Отвечает за: список сообщений (`messages`), выбранную модель (`model`), признак активного запроса
 * (`isStreaming`) и отправку хода (`send`). Больше никто состояние не держит — компоненты получают
 * его пропсами от `App.tsx`, а персист делает эффект на изменение `messages` (один источник правды).
 *
 * Взаимодействие:
 *   - `api/chatApi.ts` — `streamChat` (сеть) и `DEFAULT_MODEL`;
 *   - `hooks/chatStorage.ts` — `loadMessages` при инициализации и `saveMessages` в эффекте;
 *   - `types.ts` — формы сообщений и модели.
 *
 * Ключевые правила (FR-02…FR-07, FR-20, D-13/D-17):
 *   - пустой/пробельный ввод игнорируется; отправка во время активного запроса игнорируется;
 *   - сообщение пользователя добавляется немедленно, затем создаётся плейсхолдер ассистента, в
 *     который дописываются куски ответа — по одному на кадр, без батчинга (NFR-05b);
 *   - при ошибке плейсхолдер удаляется целиком, вместо него добавляется запись `kind: 'error'`;
 *     история (включая неудачный ход пользователя) сохраняется, следующий ход работает (FR-07);
 *   - незавершённый запрос отменяется на размонтировании, без добавления записи об ошибке;
 *   - выбранная модель не персистится: после перезагрузки снова `DEFAULT_MODEL` (D-17);
 *   - в тело запроса попадают только `{role, content}`: записи `error` фильтруются, `id`/`kind`
 *     отбрасываются (FR-04).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, MessageRole, ModelChoice } from '../types'
import { streamChat } from '../api/chatApi'
import { loadMessages, saveMessages } from './chatStorage'

/** Модель по умолчанию для нового сеанса (FR-06, D-17): селектор не персистится. */
export const DEFAULT_MODEL: ModelChoice = 'deepseek'

/** Публичный контракт хука — им пользуются App.tsx и тесты. */
export interface UseChatResult {
  /** Вся переписка в порядке разговора, включая записи об ошибках (`kind: 'error'`). */
  messages: ChatMessage[]
  /** Текущая модель; уходит полем `model` в каждый запрос (FR-06). */
  model: ModelChoice
  /** Меняет модель для следующих запросов; во время стрима не блокируется (влияет на следующий ход). */
  setModel: (model: ModelChoice) => void
  /** `true` от синхронного начала отправки до терминального кадра (управляет индикатором, FR-05). */
  isStreaming: boolean
  /** Отправляет реплику: пустой ввод и повторная отправка во время стрима — no-op (FR-02). */
  send: (text: string) => void
}

/**
 * Создаёт и возвращает состояние чата.
 *
 * Внутреннее состояние (hooks): `messages` — инициализируется лениво из `loadMessages()` (FR-03,
 * FR-20: после перезагрузки беседа восстанавливается в исходном порядке); `model` — `DEFAULT_MODEL`;
 * `isStreaming` — `false`; ref с `AbortController` активного запроса (нужен для отмены на анмаунте).
 *
 * Эффекты:
 *   - на изменение `messages` — `saveMessages(messages)` (персист всей истории; ошибки хранилища
 *     глотает сам chatStorage);
 *   - на размонтирование — `abort()` активного контроллера; отменённый запрос не добавляет запись
 *     об ошибке и не трогает состояние (FR-07).
 *
 * Ход `send(text)`:
 *   1. `text.trim()` пуст или `isStreaming` → выход без изменений;
 *   2. синхронно: добавляется сообщение пользователя (`kind: 'user'`, `id = crypto.randomUUID()`)
 *      и сразу же поднимается `isStreaming` (индикатор появляется без задержки, NFR-05a);
 *   3. тело запроса собирается из ТЕКУЩЕГО списка (включая только что добавленный ход):
 *      `messages.filter(m => m.kind !== 'error').map(({kind, content}) => ({role: kind, content}))`
 *      + `{model}` — то есть полная история сессии в порядке разговора (FR-04);
 *   4. добавляется плейсхолдер ассистента (`kind: 'assistant'`, пустой `content`), в него
 *      дописывается каждый кусок из `onChunk` (обновление состояния по каждому кадру);
 *   5. успех: плейсхолдер остаётся с полным текстом, `isStreaming` опускается;
 *   6. ошибка (`ChatRequestError` или сетевой сбой): плейсхолдер удаляется, вместо него в конец
 *      списка добавляется запись `kind: 'error'` с текстом ошибки, `isStreaming` опускается —
 *      прежние сообщения остаются нетронутыми (D-13/OQ-D: частичный ответ не сохраняется);
 *   7. отмена (анмаунт): ни ошибки, ни изменений состояния.
 *
 * Возвращаемый объект стабилен по ссылкам настолько, насколько это возможно (`setModel` и `send`
 * мемоизированы), чтобы не перерисовывать список на каждый рендер.
 */
export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [model, setModel] = useState<ModelChoice>(DEFAULT_MODEL)
  const [isStreaming, setIsStreaming] = useState(false)
  // Актуальный список для сборки тела запроса: send не зависит от идентичности массива.
  const messagesRef = useRef(messages)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesRef.current = messages
    saveMessages(messages) // один источник правды: персист на каждое изменение списка
  }, [messages])

  useEffect(() => {
    // Отмена незавершённого запроса на размонтировании: без записи об ошибке (FR-07).
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      const content = text.trim()
      if (content === '' || isStreaming) return // пустой ввод и повтор во время стрима — no-op

      const userMessage: ChatMessage = { id: crypto.randomUUID(), kind: 'user', content }
      // Тело запроса — текущий список (включая только что добавленный ход) без локальных полей.
      const history = [...messagesRef.current, userMessage]
      const requestMessages = history
        .filter(isWireMessage)
        .map((message) => ({ role: message.kind, content: message.content }))
      const placeholderId = crypto.randomUUID()
      const controller = new AbortController()
      abortRef.current = controller

      // Индикатор появляется синхронно, вместе с репликой пользователя (NFR-05a).
      setMessages([...history, { id: placeholderId, kind: 'assistant', content: '' }])
      setIsStreaming(true)

      streamChat(
        { messages: requestMessages, model },
        (chunk) => {
          // Каждый кадр — отдельное обновление состояния, без батчинга (NFR-05b).
          setMessages((current) =>
            current.map((message) =>
              message.id === placeholderId
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          )
        },
        controller.signal,
      )
        .then((answer) => {
          // Терминальный кадр — источник истины: в пузыре оказывается ровно done.answer.
          setMessages((current) =>
            current.map((message) =>
              message.id === placeholderId ? { ...message, content: answer } : message,
            ),
          )
          setIsStreaming(false)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return // анмаунт: ни ошибки, ни изменений состояния
          const text = errorMessage(error)
          // Плейсхолдер отбрасывается целиком (D-13): частичный ответ в историю не попадает.
          setMessages((current) => [
            ...current.filter((message) => message.id !== placeholderId),
            { id: crypto.randomUUID(), kind: 'error', content: text },
          ])
          setIsStreaming(false)
        })
    },
    [isStreaming, model],
  )

  return { messages, model, setModel, isStreaming, send }
}

/** Пропускает на бэк только роли user/assistant: записи об ошибках — локальные (FR-04). */
function isWireMessage(message: ChatMessage): message is ChatMessage & { kind: MessageRole } {
  return message.kind !== 'error'
}

/** Текст для записи kind: 'error'; у не-Error значений (сетевой сбой, строковый throw) — общий текст. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  return 'Не удалось получить ответ'
}
