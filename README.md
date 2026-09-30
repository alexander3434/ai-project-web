# Ai-Turbo Web — React-чат

Веб-клиент к бэкенду ai-turbo (`/Users/murkka/Work/ai-project`): одно окно чата с обоими
инструментами бэка — `get_weather` и `find_fueling` — и выбором провайдера (`local`/`deepseek`).
Ответ приходит потоком (SSE-кадры `chunk`/`done`/`error`) и дописывается в сообщение по мере
поступления; история разговора живёт в `localStorage` (ключ `ai-turbo-chat-history`).

## Стек

React 19 + TypeScript + Vite 8; состояние — React-хуки (`useChat`), запросы — `fetch`.
Без CSS-фреймворков, стейт-менеджеров и HTTP-клиентов; тесты — Vitest + Testing Library.

## Команды

```bash
npm install            # один раз, ставит и dev-зависимости тестов
npm run dev            # Vite dev-сервер на http://localhost:5173 (прокси /chat на бэк)
npm run build          # прод-сборка (tsc -b && vite build), вердикт: success/errors
npm run typecheck      # только проверка типов (tsc -b)
npm run test           # Vitest в один прогон (офлайн, без бэка)
npm run test:watch     # тот же набор в watch-режиме
npm run preview        # локальный просмотр собранного dist/
npm run lint           # oxlint
```

Тесты лежат рядом с кодом (`src/**/*.test.ts(x)`) и не требуют ни бэка, ни сети: `fetch`,
`ReadableStream` и `localStorage` замоканы.

## Адрес бэкенда и прокси

В dev-режиме запросы идут на относительный путь `/chat`, а Vite проксирует их на
`http://localhost:8080` (см. `vite.config.ts`, `server.proxy['/chat']` с `changeOrigin: true`),
поэтому CORS не нужен. В собранном приложении используется `http://localhost:8080`.

Переопределить адрес можно переменной окружения (создаётся на этапе сборки):

```bash
VITE_API_BASE_URL=http://192.168.1.10:8080 npm run build
```

| Переменная | Значение по умолчанию | Когда нужна |
|---|---|---|
| `VITE_API_BASE_URL` | нет (в dev — прокси, в прод-сборке — `http://localhost:8080`) | бэк на другом хосте/порту |

## Как воспроизвести E2E-1 (погода со стримингом)

1. Запустить бэкенд (нужен ключ DeepSeek или поднятая Ollama для `model=local`; для записи
   погоды — локальная БД, см. README бэка):

   ```bash
   cd /Users/murkka/Work/ai-project && ./gradlew run     # http://localhost:8080
   ```

2. Запустить фронтенд:

   ```bash
   cd /Users/murkka/Work/ai-turbo-web && npm install && npm run dev   # http://localhost:5173
   ```

3. В браузере задать вопрос «Какая сейчас погода в Москве?» и нажать Enter.

   Ожидаемое поведение: сообщение пользователя появляется сразу, индикатор «Ассистент печатает…»
   виден во время стрима, текст ответа дописывается несколькими порциями (не одним куском), в
   конце индикатор исчезает, а ответ совпадает с данными инструмента.

4. Цепочка запроса в логе бэка (один `req=` на запрос, кадры — в ответе):

   ```bash
   grep 'stage=tool tool=get_weather' /Users/murkka/Work/ai-project/logs/ai-turbo.log | tail -1
   grep '<req-id> ' /Users/murkka/Work/ai-project/logs/ai-turbo.log
   ```

   Порядок: `inbound` → `deepseek-request`/`deepseek-response` → `db` → `tool` →
   `deepseek-request … streaming=true` → `deepseek-response` → `outbound status=200` с телом
   `done`-кадра.

5. Проверка контракта без браузера:

   ```bash
   curl -N -X POST http://localhost:8080/chat \
     -H 'Content-Type: application/json' \
     -d '{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"local"}'
   ```

   Кадры `event: chunk` печатаются по мере поступления, затем ровно один `event: done`, у которого
   `answer` равен склейке текстов всех `chunk`.

История сохраняется в `localStorage` (`ai-turbo-chat-history`) и восстанавливается после
перезагрузки страницы; следующая отправка несёт весь разговор, поэтому уточняющие вопросы
(«А завтра?») не требуют повторять контекст. Ошибка запроса показывается красным баннером и не
теряет историю — следующий вопрос можно задать сразу.

Полный контракт `/chat` (кадры, коды ошибок, трассировка, примеры для Postman) — в README бэка.
