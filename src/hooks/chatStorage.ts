/**
 * Слой хранения истории чата (FR-03, ASM-02): единственный ключ `ai-turbo-chat-history`, никаких
 * секретов (FR-08/NFR-03). Чистые функции без React — тестируются офлайн с моками `localStorage`
 * (T-14, NFR-01).
 *
 * Взаимодействие: модуль используют только `hooks/useChat.ts` (инициализация состояния и персист
 * эффектом на изменение списка сообщений). Форма записи — `ChatMessage` из `types.ts`, порядок
 * массива = порядок разговора.
 */

import type { ChatMessage, MessageKind } from '../types'

/** Ключ localStorage с историей чата — зафиксирован CODE_STYLE.md/ASM-02; других ключей фронт не пишет. */
export const CHAT_STORAGE_KEY = 'ai-turbo-chat-history'

/** Допустимые значения `kind` — используется при валидации записей из хранилища. */
const ALLOWED_KINDS: readonly MessageKind[] = ['user', 'assistant', 'error']

/**
 * Проверяет одну запись из хранилища (данные недоверенные: их мог испортить пользователь или
 * старая версия приложения). Ничего не бросает и не мутирует вход — только сужение типа.
 *
 * @param value значение из JSON.parse: `unknown`, проверяется по полям (CODE_STYLE.md: `unknown` + сужение)
 * @returns `true`, если это объект с `id: string`, `kind` из ALLOWED_KINDS и `content: string`
 */
function isValidMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; kind?: unknown; content?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.content === 'string' &&
    isAllowedKind(candidate.kind)
  )
}

/** Сужение `kind` до `MessageKind`: значение должно быть одним из ALLOWED_KINDS. */
function isAllowedKind(value: unknown): value is MessageKind {
  return ALLOWED_KINDS.some((kind) => kind === value)
}

/**
 * Читает историю из localStorage и приводит её к валидному списку сообщений.
 *
 * Поведение и краевые случаи:
 *   - ключа нет, `getItem` бросил (storage отключён), JSON не парсится или в корне не массив → `[]`;
 *   - записи проверяются по одной: невалидные отбрасываются, валидные сохраняют исходный порядок
 *     (FR-03: «повреждённое хранилище не ломает приложение»);
 *   - отсутствие/пустота хранилища — нормальный старт с пустой беседой, без ошибок в консоли.
 *
 * Побочные эффекты: только чтение localStorage; результат — новый массив (мутировать его безопасно).
 *
 * @returns история в порядке разговора; `[]`, если читать нечего или всё содержимое невалидно
 */
export function loadMessages(): ChatMessage[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(CHAT_STORAGE_KEY)
  } catch {
    // storage отключён (приватный режим, политика браузера) — стартуем с пустой беседой
    return []
  }
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // повреждённое хранилище не ломает приложение (FR-03)
    return []
  }
  if (!Array.isArray(parsed)) return []

  const entries: unknown[] = parsed
  return entries.filter(isValidMessage)
}

/**
 * Сохраняет историю в localStorage целиком, в порядке разговора (FR-03).
 *
 * Поведение и краевые случаи:
 *   - сериализует массив `ChatMessage` как есть (`id`/`kind`/`content` — локальные поля, на бэк
 *     они не уходят: их выбрасывает сборка запроса в useChat, FR-04);
 *   - полностью обёрнут в `try/catch`: переполнение квоты, приватный режим или отключённый storage
 *     (исключение из `setItem`) не должны ломать UI — ошибка глотается молча (R-08);
 *   - вызывается эффектом на каждое изменение списка сообщений (один источник правды — состояние хука).
 *
 * @param messages текущий список сообщений в порядке разговора (может быть пустым — пишется `[]`)
 */
export function saveMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // переполнение квоты, приватный режим или отключённый storage не должны ломать UI (R-08)
  }
}
