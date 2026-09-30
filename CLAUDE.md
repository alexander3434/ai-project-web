# Ai-Turbo Web — инструкции для Claude Code и агентов

React-фронтенд (TypeScript + Vite) к бэку ai-turbo (`/Users/murkka/Work/ai-project`,
Kotlin/Ktor/Koog/Kodein/Exposed). Бэк запускается отдельно: `cd ../ai-project && ./gradlew run`.

## Обязательные правила для ВСЕХ агентов

- Код-стайл: `CODE_STYLE.md` в корне; дифф проверяется агентом `code-style-checker`.
- **Сборка — только вердикт**: `npm run build` (и `npm run typecheck`, если есть) — читать
  ТОЛЬКО success/errors и первые 20–40 строк ошибок. Запрещено копировать полный вывод
  сборки/дев-сервера/логов в контекст.
- Логи бэка — только через grep по `req=`/`stage=` в `../ai-project/logs/ai-turbo.log`.
- Никаких секретов в коде и коммитах. Коммит/пуш — только по явной просьбе пользователя.
- Спецификации — через `/feature-design` в `docs/features/<slug>/`, реализация — через
  `/feature-implementation` строго по `spec.md`.

## Команды

```bash
npm install            # один раз
npm run dev            # Vite dev-сервер (прокси на бэк — см. vite.config.ts)
npm run build          # сборка (вердикт: success/errors)
```

## Локальные агенты

`.claude/agents/`:
- `code-style-checker` — дифф по CODE_STYLE.md;
- `reviewer-correctness` — баги и корректность;
- `reviewer-deduplication` — дублирование/избыточность/симплификация;
- `reviewer-git` — диффы, git-состояние, секреты.
