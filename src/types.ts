/**
 * Общие типы фронтенда чата (CODE_STYLE.md: «src/types.ts — общие типы (Message, Role, ModelChoice)»).
 *
 * Роли модулей:
 *   - `ChatMessage` — одна запись в списке сообщений; одновременно это форма хранения в localStorage
 *     (`ai-turbo-chat-history`, FR-03) и источник для тела запроса (локальные поля `id`/`kind`
 *     выбрасываются при сборке тела, FR-04);
 *   - `MessageKind` различает роли «на проводе» (`user`/`assistant`) и локальную запись об ошибке
 *     (`error`, FR-07/D-13): она рендерится в списке, но никогда не уходит на бэк;
 *   - `ModelChoice` — значение поля `model` в POST /chat (FR-06); дефолт задаёт `useChat`, выбор
 *     между перезагрузками не сохраняется (D-17).
 *
 * Взаимодействие: тип импортируют hooks/useChat.ts, hooks/chatStorage.ts, компоненты списка и
 * App.tsx; сам модуль ничего не импортирует и не имеет рантайм-кода (стирается на этапе сборки).
 * Никаких `any` (CODE_STYLE.md); других экспортов из этого модуля нет.
 */

/** Роль сообщения, которую понимает бэк: POST /chat принимает только `user` и `assistant` (FR-04). */
export type MessageRole = 'user' | 'assistant'

/** Вид записи в UI: роль для бэка плюс локальный вид `error` — ошибка хода, в запрос не попадает (D-13). */
export type MessageKind = MessageRole | 'error'

/**
 * Одно сообщение чата: единственная сущность, которая живёт в состоянии useChat и в localStorage.
 * Порядок записей в массиве = порядок разговора (FR-03, FR-04).
 */
export interface ChatMessage {
  /** Локальный идентификатор (`crypto.randomUUID()`) — ключ React-списка; на бэк не уходит (FR-04). */
  id: string
  /** `user`/`assistant` — уходит на бэк как `role`; `error` — только локальная запись об ошибке. */
  kind: MessageKind
  /** Текст сообщения; пробельные/пустые значения не отправляются (FR-02) и не считаются ответом. */
  content: string
}

/** Провайдер на запрос (FR-06): `local` = Ollama, `deepseek` = DeepSeek; дефолт — `deepseek`. */
export type ModelChoice = 'local' | 'deepseek'
