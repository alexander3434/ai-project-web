# Ai-Turbo Web — Code Style

Код-стайл фронтенд-проекта (React-чат для бэка ai-turbo). Агент `code-style-checker`
проверяет каждый дифф по этому документу.

## Стек

Только: **TypeScript, React, Vite**. Без Redux/Zustand (состояние — React hooks/context),
без jQuery, без CSS-фреймворков по умолчанию (простой CSS; Tailwind — только если явно
согласован). Запросы к бэку — `fetch` (или `EventSource` для SSE-стриминга), без axios.

## Структура

| Путь | Содержимое |
|---|---|
| `src/api/` | клиент бэка: типы DTO, функции запросов (chat, weather, fueling, history) |
| `src/components/` | UI-компоненты (MessageList, MessageBubble, ChatInput, ModelSelector, …) |
| `src/hooks/` | кастомные хуки (useChat — история сообщений, стриминг) |
| `src/types.ts` | общие типы (Message, Role, ModelChoice) |
| `src/App.tsx` | композиция экрана |

Один компонент — один файл; имена компонентов PascalCase, файлы тоже (MessageBubble.tsx);
хуки `useXxx.ts`/`.tsx`; типы — явные, без `any` (допускается `unknown` с сужением).

## Чат и история

- История сообщений живёт в `useChat` (in-memory + `localStorage`-персист, ключ
  `ai-turbo-chat-history`); отправка на бэк — полная история сессии (см. контракт бэка).
- Стриминг ответа — через SSE (`EventSource`/`fetch` ReadableStream); токены дописываются
  в последнее сообщение, ошибки стрима не теряют историю.
- Выбор модели (`local`/`deepseek`) — отдельное поле каждого запроса; дефолт `deepseek`.

## Тесты и сборка

- `npm run build` (или `npm run typecheck`) — читать ТОЛЬКО вердикт сборки и первые
  20–40 строк ошибок. Полный вывод сборки/дев-сервера в контекст не тащить.
- Тесты (если есть) — офлайн, без живого бэка: мокать `fetch`/`EventSource`.

## Правила безопасности

- Никаких ключей/паролей в коде фронта и в `localStorage` (кроме истории чата).
- Адрес бэка — одна константа (`VITE_API_BASE_URL`, дефолт `http://localhost:8080`);
  Vite dev-proxy — предпочтительный способ обхода CORS.
