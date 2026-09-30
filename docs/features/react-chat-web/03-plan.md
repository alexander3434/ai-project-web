# React Chat Web — Implementation Plan

Sources: `01-requirements.md`, `02-design.md` (this folder). This plan is the implementation's only
instruction set; it does not re-design anything. Two projects are touched:

- **Backend** — `/Users/murkka/Work/ai-project` (Kotlin/Ktor/Koog/Kodein/Exposed). Path convention in
  this plan: `src/main/kotlin/com/aiturbo/<path>` for main, `src/test/kotlin/com/aiturbo/<path>` for tests.
- **Frontend** — `/Users/murkka/Work/ai-turbo-web` (React/TS/Vite). Path convention: path relative to
  the project root.

Size classes: **S** ≈ up to 2 h, **M** ≈ up to half a developer-day, **L** ≈ up to one developer-day
(no task exceeds 1 day).

Recorded constraints (from `02-design.md`, do not deviate silently):

- No new backend dependency; `ktor-server-sse` is **only** the recorded fallback if R-04 materializes
  (ASM-12, D-05). No `application.conf` change (D-15).
- Frontend dev-dependency versions (`vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`) are resolved by npm at implementation
  time and recorded in `package.json`/lockfile (T-11, D-14); no runtime dependency beyond React/Vite.
- The backend slice is built and verified **before** the frontend consumes the contract (design risk 7).

## Task list

| ID | Title | Depends on | Size | Files to touch | Description / linked FRs and design refs |
|---|---|---|---|---|---|
| T-01 | Koog 1.2.0 API probe (compile-first) | — | S | backend: `KoogApiProbeTest.kt` (temporary, deleted after recording) | Compile-probe of every Koog API the design uses (`AIAgent.builder`, `functionalStrategy`, `appendPrompt`, `requestLLM`, `requestLLMStreaming`, `llm.writeSession`, `PromptBuilder.user/assistant/toolResult/message`, `StreamFrame.TextDelta/ToolCallComplete/End`, `MessagePart.Tool.Call`, `executeTools`); record the verified signatures and the D-04 fact "`requestLLMStreaming` does not self-append the reply" from the resolved 1.2.0 sources. Design risks 1–3; D-03, D-04. |
| T-02 | Chat DTOs + domain types + validator | — | M | backend: `chat/ChatAgent.kt` (new), `chat/ChatRequestValidator.kt` (new), `plugins/ChatRouting.kt` (request/frame DTOs only — route body added by T-09), `ChatRequestValidatorTest.kt` (new) | `ChatAgent`/`ChatSession`/`ChatTurn`/`ChatTurnRole`; pure `validate(request): String?` + `toSession(request): ChatSession`; request/frame DTOs (`ChatRequest`, `ChatMessageDto`, `ChatChunkFrame`, `ChatDoneFrame`, `ChatErrorFrame`) with the same `@EncodeDefault(NEVER)` model trick as `WeatherRequest`. FR-09; design Components + API design tables; ASM-06. |
| T-03 | `StreamedAssistant` accumulator | T-01 | S | backend: `llm/StreamedAssistant.kt` (new), `StreamedAssistantTest.kt` (new) | Accumulates `StreamFrame`s into the assembled `Message.Assistant` (text from `TextDelta` only; tool calls from `ToolCallComplete`), shared by the agent and the logging decorator. FR-10/FR-14; D-11. |
| T-04 | `KoogChatAgent` + combined system prompt | T-01, T-02, T-03 | L | backend: `chat/KoogChatAgent.kt` (new), `KoogChatAgentTest.kt` (new) | The unified agent (both tools in the chat registry, `CHAT_SYSTEM_PROMPT`, functional strategy: `appendPrompt` history → non-streamed round 0 → per-tool-round `requestLLMStreaming` → deltas emitted → manual `appendPrompt { message(...) }` → fallback answers). FR-11, FR-12; D-01–D-04; design agent pseudocode. |
| T-05 | `ProviderAvailability` pre-stream check | — | S | backend: `llm/ProviderAvailability.kt` (new), `ProviderAvailabilityTest.kt` (new) | Secret-free `deepseekConfigured` boolean; `unavailableReason(target)` → the 503 text for a blank DeepSeek key, `null` for local. FR-09; D-09. |
| T-06 | Routing executor: resolved-model streaming overload | T-01 | M | backend: `llm/ProviderRoutingPromptExecutor.kt`, `ProviderRoutingPromptExecutorTest.kt` | Additive override of `executeStreaming(prompt, model: ResolvedModel, tools)` mirroring the existing routing (local → `localModel`, deepseek → `model.effectiveModel`; target read at collect time; blank key still throws). FR-13; D-10. |
| T-07 | Logging executor: streamed outcome line | T-01, T-03 | M | backend: `log/LoggingPromptExecutor.kt`, `LoggingPromptExecutorTest.kt` | Keep the `streaming=true` request line; after the stream ends log the assembled `stage=deepseek-response` (same shape as the non-streaming line) or the failure marker (`TraceLog.deepseekFailure`, today's `stage=deepseek-response … error=…`); frames stay unfiltered and unordered; `CancellationException` rethrows with no response line. FR-14, NFR-06; D-11 (recorded exception). |
| T-08 | `chatModule` DI + availability binding | T-04, T-05 | M | backend: `Application.kt`, `ChatModulesTest.kt` (new) | `CHAT_TOOL_REGISTRY` registry built from the existing `GetWeatherTool`/`FindFuelingTool` singletons; `bind<ChatAgent>()` = `KoogChatAgent`; `appModules` binds `ProviderAvailability`; `Application.module` imports `chatModule()` unconditionally. FR-11, FR-15; D-01, D-02, D-09. |
| T-09 | `POST /chat` SSE route + registration | T-02, T-04, T-05, T-08 | L | backend: `plugins/ChatRouting.kt` (route), `plugins/Routing.kt` (one call), `ChatRoutesTest.kt` (new) | Validation → `LlmTarget` → availability → `respondTextWriter(ContentType.Text.EventStream)` with chunk/done/error frames, in-stream error mapping (`inStreamFailure`), `sseFrame`, `outbound` line. FR-09, FR-10, FR-13, FR-14; design API design + error paths; D-05–D-08, D-12. |
| T-10 | Offline chain integration + backend gate | T-09, T-06, T-07 | L | backend: `ChatChainIntegrationTest.kt` (new) | Full offline chain through the real agent, real chat registry and a scripted executor: frames, history replay in `deepseek-request`, `tool`/`db`, `streaming=true`, `outbound`, ≥2 chunks before the terminal frame, no secrets; plus the full-suite gate. FR-12, FR-16–FR-19 (offline proxies); NFR-02/03/04/06. |
| T-11 | Frontend scaffold + tooling | T-09 | M | frontend: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `eslint.config.js`, `.gitignore`, `src/main.tsx`, `src/test/setup.ts` | The recorded one-off scaffold (`npm create vite@latest . -- --template react-ts`, template demo content removed, `CLAUDE.md`/`CODE_STYLE.md`/`.claude/`/`docs/` untouched), scripts, dev proxy, Vitest config, dev-only test deps. FR-01, FR-08; NFR-01; design Scaffolding, D-14. |
| T-12 | `types.ts` + SSE parser + tests | T-11 | M | frontend: `src/types.ts`, `src/api/sse.ts`, `src/api/sse.test.ts` | The shared types exactly as designed; pure `createSseParser()` handling `\n`/`\r\n`, multi-line `data:`, comments/`id`/`retry`, one optional space after `data:`, and partial frames buffered across `push` calls. FR-04/FR-05 (types); NFR-01; design `sse.ts`. |
| T-13 | `chatApi.streamChat` + tests | T-12 | M | frontend: `src/api/chatApi.ts`, `src/api/chatApi.test.ts` | `API_BASE_URL` constant, `ChatRequestError`, the POST + fetch-stream client (chunk → `onChunk`, `done` → resolve, `error`/no-terminal/wrong-content-type/not-ok → typed throws). FR-05, FR-07, FR-08, FR-10; D-06, design chatApi contract. |
| T-14 | `chatStorage` + tests | T-11, T-12 | S | frontend: `src/hooks/chatStorage.ts`, `src/hooks/chatStorage.test.ts` | `loadMessages`/`saveMessages` for `ai-turbo-chat-history`: missing/invalid JSON/non-array → `[]`, per-entry validation drops invalid entries, save wrapped in `try/catch`. FR-03; ASM-02. |
| T-15 | `useChat` hook + tests | T-13, T-14 | L | frontend: `src/hooks/useChat.ts`, `src/hooks/useChat.test.tsx` | Single state owner: init from storage, immediate user message, placeholder + per-frame chunk append, request built from the filtered/stripped list with `model`, error entry on failure (placeholder discarded), persistence effect, abort on unmount, ignores blank/while-streaming sends. FR-02–FR-07, FR-20; D-13, D-17. |
| T-16 | Message list components + tests | T-11, T-12 | M | frontend: `src/components/{ChatWindow,MessageList,MessageBubble,ErrorBanner}.tsx`, `src/components/MessageList.test.tsx` | Bubbles with the designed ARIA/classes, `ErrorBanner` (`role="alert"`), the activity indicator (`role="status"`, «Ассистент печатает…»), scroll pinning only when near the bottom. FR-02, FR-05, FR-07; design component table. |
| T-17 | Input + model selector + tests | T-11, T-12 | M | frontend: `src/components/{ChatInput,ModelSelector}.tsx`, `src/components/{ChatInput,ModelSelector}.test.tsx` | Chat input (Enter sends, blank blocked, disabled while streaming, focus kept) and the `local`/`deepseek` selector (default `deepseek`, value bound). FR-02, FR-06; ASM-10. |
| T-18 | App shell + styles + App test | T-15, T-16, T-17 | M | frontend: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/App.test.tsx` | Header + selector + window + input composed from `useChat()`; `StrictMode`; plain CSS (bubbles, layout, indicator animation); happy-path and error-path app tests. FR-01, FR-02, FR-08; NFR-07. |
| T-19 | Frontend offline gate + reviews | T-18 | S | frontend: test/dep fixes only (no product changes expected) | `npm run test` (backend stopped), `npm run build`, `npm run typecheck` verdicts; NFR-01 coverage check; dependency and secrets checks; the four review agents over the frontend diff. FR-01, FR-21; NFR-01/03/04/08. |
| T-20 | Docs: backend `README.md` `/chat` + frontend `README.md` | T-09, T-11, T-19 | M | backend: `README.md`; frontend: `README.md` (new) | `/chat` contract, frames, `curl -N` example, trace, Postman note; frontend install/run/build/test commands, dev proxy, `VITE_API_BASE_URL`, E2E-1 reproduction. FR-22, FR-21. |

## Work order and milestones

### Cross-cutting execution rules (both projects, NFR-08, FR-21)

- Build/test output is read as a **verdict only**: `./gradlew test` → `BUILD SUCCESSFUL`/`BUILD FAILED`
  plus at most the first 20–40 error lines; `npm run build`/`npm run typecheck`/`npm run test` →
  success/errors only. Never copy full build, dev-server or log output into any artifact.
- Backend logs are inspected only via `grep` for `req=`/`stage=` in
  `/Users/murkka/Work/ai-project/logs/ai-turbo.log`.
- Tests are offline in both projects: backend fakes/`MockEngine`/`LogCapture`/frozen `Clock`; frontend
  mocked `fetch`/`ReadableStream`/`localStorage`. No live DB, LLM, network or backend process.
- No secrets in code, config, logs, frames, docs or `localStorage` (only `ai-turbo-chat-history`).
  No commit or push without an explicit user request.
- Reviews by the project agents (`code-style-checker`, `reviewer-correctness`, `reviewer-deduplication`,
  `reviewer-git`) in both repositories; the implementation record references the T-IDs and the review runs.

### Deviation protocol

If the implementation finds the design or the resolved Koog/DOM APIs differ from `02-design.md`, stop,
record the deviation with evidence, and escalate to the user via the orchestrator **before** continuing.
No silent re-design; no "fix" of documented behavior (e.g. the `tools_count` cosmetic mismatch in R-02).

### Sequence and parallel batches

1. **Batch B1 (backend primitives):** T-01 ‖ T-02 ‖ T-05.
2. **Batch B2 (agent + streaming plumbing):** T-03 ‖ T-06; then T-04 ‖ T-07.
3. **Batch B3 (endpoint + lock):** T-08; then T-09; then T-10.
4. **Batch B4 (frontend, only after T-09 = contract frozen):** T-11; then T-12 ‖ T-14; then T-13; then
   T-15; then T-16 ‖ T-17; then T-18; then T-19.
5. **Batch B5 (docs + live E2E):** T-20; then M-06.

T-04 and T-07 must not start before T-01's probe result is recorded (design risk 1).

### Milestones

- **M-01 — Backend contract primitives verified.** Tasks: T-01, T-02, T-05.
  *Exit:* probe result recorded (signatures + D-04 finding; probe deleted, suite green); validator/DTO
  unit tests green; `./gradlew test` → `BUILD SUCCESSFUL` with the 250 pre-existing tests untouched.
- **M-02 — Agent and streaming plumbing offline-verified.** Tasks: T-03, T-04, T-06, T-07.
  *Exit:* scripted-executor tests prove history replay, the tool round with `stage=tool`, the streamed
  post-tool round emitting per-delta pieces, and the manual assistant-message append; the routing
  override and the streamed outcome log line have their tests; `./gradlew test` → `BUILD SUCCESSFUL`
  (the only changed pre-existing expectation is the recorded `LoggingPromptExecutorTest` streaming one).
- **M-03 — `POST /chat` served; backend contract frozen.** Tasks: T-08, T-09, T-10.
  *Exit:* `ChatModulesTest` proves the chat registry holds both tools while the weather/fueling
  registries stay single-tool; `ChatRoutesTest` proves the byte-exact frame contract, pre-stream JSON
  `400`/`503`, the in-stream `error` frame and the one-`req=` chain; `ChatChainIntegrationTest` proves
  the full offline chain; full `./gradlew test` → `BUILD SUCCESSFUL` with the 250 pre-existing tests
  green (one recorded exception); backend diff reviewed by the four project agents. The contract is now
  frozen for the frontend.
- **M-04 — Frontend app usable in dev.** Tasks: T-11–T-18.
  *Exit:* `npm run build` and `npm run typecheck` success verdicts; `npm run test` green (co-located
  tests); `npm run dev` serves a page that renders the chat shell with an empty conversation and no
  console errors (backend not required for this milestone).
- **M-05 — Both suites green; docs consistent.** Tasks: T-19, T-20.
  *Exit:* `npm run test` exits 0 with the backend stopped and covers the NFR-01 minimum; `./gradlew test`
  → `BUILD SUCCESSFUL`; a reader can reproduce E2E-1 from the two READMEs alone; secrets grep over both
  projects finds 0 matches; frontend diff reviewed by the four project agents.
- **M-06 — Live E2E (manual checklist).** Prerequisite: M-05. *Exit:* every check below passes on the
  development machine; evidence is recorded as verdicts only.

**M-06 checklist (exact commands; macOS, both servers on the same machine).**

Prerequisites:

```bash
cd /Users/murkka/Work/ai-project && ./gradlew test          # verdict: BUILD SUCCESSFUL
ollama list                                                 # qwen3:8b present (for model=local)
grep -c 'DEEPSEEK_API_KEY' .env                             # key present in the git-ignored file only
cd /Users/murkka/Work/ai-project && ./gradlew run           # backend on http://localhost:8080
# local DB container up (get_weather writes); stage DB reachable (fueling read)
cd /Users/murkka/Work/ai-turbo-web && npm install && npm run dev   # app on http://localhost:5173
```

- **M-06.1 — Stream contract via curl (frames + visibility).**
  `curl -N -X POST http://localhost:8080/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"local"}'`
  Expect: `event: chunk` frames printed incrementally (visible before the process ends), then exactly one
  `event: done` whose `answer` equals the concatenation of the chunk texts, then close. Pre-stream JSON
  check: `curl -i -X POST http://localhost:8080/chat -H 'Content-Type: application/json' -d '{"messages":[]}'`
  → `400` JSON `{"error":…}` (not a stream); with the key absent, `model=deepseek` → `503` JSON.
  Postman note: send the same POST with `Content-Type: application/json` and
  `Accept: text/event-stream`; Postman shows the raw event stream, but some versions buffer it until the
  end — the incremental check is `curl -N` and the browser.
- **M-06.2 — E2E-1 + E2E-5 (weather, streaming, tool line).** In the UI ask
  «Какая сейчас погода в Москве?»: the indicator appears within ~200 ms, the text grows in at least 3
  visible steps, the final text matches the tool data. Trace:
  `grep 'stage=tool tool=get_weather' /Users/murkka/Work/ai-project/logs/ai-turbo.log | tail -1`, then
  `grep '<req-id> ' /Users/murkka/Work/ai-project/logs/ai-turbo.log` (id copied from the previous line):
  ordered chain `inbound` → `deepseek-request`/`deepseek-response` → `db` → `tool` →
  `deepseek-request … streaming=true` → `deepseek-response` → `outbound status=200` with the `done` body;
  no secrets in the lines.
- **M-06.3 — E2E-2 (follow-up uses history).** Without reloading, ask «А завтра?»: the request body in
  devtools carries all three turns; the log's first `deepseek-request` for that `req=` shows
  `messages=[system … user(погода) … assistant(ответ) … user(А завтра?)]`; a second `get_weather` calls
  with Moscow; the user repeated no context.
- **M-06.4 — E2E-3 (fueling GUID in the same chat).** Ask «Найди данные по проливу для заказа
  61574131-999F-48C9-93AE-3EAA68562177»: the chain shows `stage=tool tool=find_fueling` and
  `stage=db … lookup=found`, the answer summarises the stage row, and the text appears incrementally.
- **M-06.5 — E2E-4 (both providers, negative case).** Repeat the weather question with the selector on
  `local` (Ollama up) and on `deepseek`: both stream; `grep 'stage=deepseek-request' … | tail -1` shows
  the Ollama endpoint/`qwen3:8b` or the DeepSeek endpoint. Negative: stop Ollama, send with `local` → an
  error message appears in the chat, the history stays intact, and the next message with `deepseek`
  succeeds.
- **M-06.6 — E2E-6 (reload restores history).** Reload the page: all messages render in the original
  order; devtools → Application → Local Storage shows only the `ai-turbo-chat-history` key; the next
  send's request payload contains the restored history.
- **M-06.7 — E2E-7 (backend green + slices untouched).** `cd /Users/murkka/Work/ai-project && ./gradlew test`
  → `BUILD SUCCESSFUL`; then
  `curl -i -X POST http://localhost:8080/weather -H 'Content-Type: application/json' -d '{"message":"Какая погода в Москве?","model":"local"}'`,
  `curl -i -X POST http://localhost:8080/fueling -H 'Content-Type: application/json' -d '{"message":"Найди пролив 61574131-999F-48C9-93AE-3EAA68562177"}'`,
  `curl -i 'http://localhost:8080/time?location=Moscow'` → documented statuses/bodies; their chains keep
  `tools_count=1`.

## Acceptance criteria

Every task additionally assumes the cross-cutting rules above (verdict-only output, offline tests, no
secrets, no commits). Evidence means a green test method, a recorded verdict, or a checklist item.

**T-01 — Koog 1.2.0 API probe (compile-first).**
- The probe compiles every API the design uses: `AIAgent.builder()` with `.id/.promptExecutor/.llmModel/
  .systemPrompt/.temperature/.maxIterations/.toolRegistry/.functionalStrategy(functionalStrategy<…>("chat"))`,
  `appendPrompt { … }` with `user/assistant/message`, `requestLLM(message)`, `llm.writeSession { … }`,
  `requestLLMStreaming()`, `PromptBuilder.toolResult`, `executeTools`, `result.toMessagePart()`,
  `StreamFrame.TextDelta/ToolCallComplete/End`, `MessagePart.Tool.Call`, `Message.Assistant`.
- `./gradlew test` reads `BUILD SUCCESSFUL` with the probe present (signatures exist in the resolved
  1.2.0 jar).
- The probe result records (a) each verified signature and (b) whether `requestLLMStreaming` appends the
  assistant reply (must match D-04: it does not; the manual `appendPrompt { message(response) }` is
  required). A mismatch is escalated per the deviation protocol before T-04 starts.
- The probe file is deleted after recording; the suite stays green.

**T-02 — Chat DTOs + domain types + validator.**
- `ChatRequestValidator` is pure (chat package, no Ktor/LLM imports) and unit-testable without a server;
  the matrix covers: empty/absent `messages`; unknown role at index *i*; blank content at index *i*;
  last message not from the user; a valid history + new user message → `null`.
- Error strings are byte-equal to the design table, asserted verbatim: `Field 'messages' must not be
  empty`; `Field 'messages[1].role' must be one of: user, assistant`; `Field 'messages[1].content' must
  not be blank`; `The last message must be from the user`.
- `toSession` maps all but the last message to `history` (roles mapped, content trimmed, order kept) and
  the trimmed last message to `message`; a `system` role is rejected by validation, never mapped.
- DTO behavior: unknown extra fields are tolerated; a request without `model` re-encodes for the trace
  without `model` (the `@EncodeDefault(NEVER)` pattern of `WeatherRequest`) and with it when sent; frame
  DTOs encode to single-line compact JSON (a JSON string payload never contains a raw newline, so one
  `data:` line per frame); a missing `role`/`content` produces a `400` (validator text or the existing
  StatusPages `Invalid request body`) — whichever the implementation chooses is covered by a test.
- `./gradlew test` → `BUILD SUCCESSFUL`; the 250 pre-existing tests untouched.

**T-03 — `StreamedAssistant` accumulator.**
- `text()` equals the concatenation of `TextDelta` frames only; `TextComplete` (after deltas) does not
  double-count; `toMessage()` produces `Message.Assistant` with the text part plus one
  `MessagePart.Tool.Call(id, name, content)` per `ToolCallComplete`, in arrival order.
- Non-text frames change no state; `accept` never throws; an empty stream yields an empty message.
- `StreamedAssistantTest` covers: deltas only; deltas + tool call; deltas followed by `TextComplete`;
  empty stream. `./gradlew test` green.

**T-04 — `KoogChatAgent` + `CHAT_SYSTEM_PROMPT`.**
- `stream()` returns a `Flow<String>` (channelFlow) that emits each `TextDelta` of the streamed round in
  order, completes after the agent run, emits the agent's returned answer if nothing was emitted, and
  reproduces the shared fallback text when the answer is blank.
- History replay (scripted executor captures prompts): the first request's prompt is
  `[system(CHAT_SYSTEM_PROMPT), user₁, assistant₁, …, user(new)]` — one turn per history entry, original
  order, system first, the new message appended exactly once (FR-12, D-03).
- Tool round: a scripted tool call in round 0 is executed by the real strategy (fakes for tool/DB), logs
  `TraceLog.tool` per call (same renderer as the other agents), and round 1 runs **streamed**
  (`requestLLMStreaming`); after the streamed round the assembled assistant message is appended manually
  (visible in a third request's prompt when the scripted streamed round itself carried a tool call) and
  the loop respects `maxToolRounds`; a non-converged loop logs the same warning as the existing agents.
- Pattern facts asserted: round 0 uses non-streaming `execute`; the post-tool round uses
  `executeStreaming`; a direct answer (no tool call in round 0) is emitted as a single piece (documented
  OQ-A consequence).
- `KoogChatAgentTest` runs offline with a scripted `PromptExecutor`; `./gradlew test` green.

**T-05 — `ProviderAvailability`.**
- `unavailableReason(LlmTarget.DEEPSEEK)` returns exactly `DeepSeek API key is not configured` when
  `deepseekConfigured == false`, and `null` when true; `LlmTarget.LOCAL` always returns `null`.
- The value carries only a boolean — no key field, no key material in `toString`/rendering (test +
  inspection).
- `ProviderAvailabilityTest` green; `./gradlew test` green.

**T-06 — Routing executor resolved-model streaming overload.**
- The new `executeStreaming(prompt, ResolvedModel, tools)` routes by the request-scoped target:
  `LOCAL` → `local.executeStreaming(prompt, localModel, tools)`, `DEEPSEEK` →
  `deepseek.executeStreaming(prompt, model, tools)`; the target is read when the flow is collected, not
  when it is built (assert by building the flow outside and collecting inside `withContext`).
- A blank DeepSeek key still throws the existing `WeatherUnavailableException` path before any delegate
  call.
- `ProviderRoutingPromptExecutorTest` gains the additive resolved-model streaming test; existing tests
  untouched; `./gradlew test` green.

**T-07 — Logging executor streamed outcome line.**
- `stage=deepseek-request … streaming=true` is still emitted before the delegate is touched.
- After a streamed call completes, exactly one `stage=deepseek-response` line is emitted with the
  assembled `text="…" tool_calls=[…]` in the same shape as the non-streaming line; frames reach the
  consumer unchanged (no filtering, no reordering — asserted by comparing emitted frames to the scripted
  ones).
- On a mid-stream error the existing `TraceLog.deepseekFailure` line is emitted and the error rethrown;
  `CancellationException` rethrows with **no** response line.
- Streamed outcome logging is active for the shapes the router uses (LLModel for local; for deepseek the
  ResolvedModel shape — if the base class does not delegate it, add the mirror override, additive, same
  pattern as T-06, and record it).
- `LoggingPromptExecutorTest`: the streamed expectation changes from 1 line to 2 (request + response) —
  the recorded D-11 exception — plus the new error case; every other assertion is untouched and the file
  is flagged to the reviewers in the implementation record.

**T-08 — `chatModule` DI + availability binding.**
- `CHAT_TOOL_REGISTRY` holds exactly `get_weather` + `find_fueling`, built from the existing tool
  singletons (`instance<GetWeatherTool>()`, `instance<FindFuelingTool>()`); the untagged `ToolRegistry`
  stays `get_weather`-only and the fueling registry `find_fueling`-only (single-tool registries, FR-15).
- `bind<ChatAgent>()` resolves to `KoogChatAgent` over the chat registry; `appModules` binds
  `ProviderAvailability(deepseek.apiKey.isNotBlank())`; `Application.module` imports `chatModule()`
  unconditionally and the DI graph builds with a blank DeepSeek key (test).
- `ChatModulesTest` covers the two registries, the agent binding and both availability flags;
  `AppModulesTest`/`FuelingModulesTest` untouched and green; no `application.conf` change.

**T-09 — `POST /chat` SSE route + registration.**
- Order enforced in the handler: receive → `beginTrace(body)` (model omitted from the trace body when
  absent) → validator (`400` JSON with the exact texts) → `LlmTarget.fromRequest` (`400
  Field 'model' must be one of: local, deepseek`) → availability (`503 {"error":"DeepSeek API key is not
  configured"}` when DeepSeek is unconfigured; `model=local` never 503s here) → open the stream. Every
  pre-stream failure is JSON, no `text/event-stream`, and shows no provider/tool line in `LogCapture`.
- Success body (fake `ChatAgent`, two chunks): `Content-Type: text/event-stream`, frames exactly
  `event: chunk\ndata: {"text":…}\n\n` (one per emitted piece, in order), then one
  `event: done\ndata: {"answer":"<concat>","model":"<local|deepseek>"}\n\n`, then close; `done.answer`
  equals the concatenation of the chunks by construction (FR-10).
- The agent runs inside `withContext(CallTrace + LlmTargetContext(target))` (fake agent asserts the
  context is present); the writer is flushed per frame so the stream is progressive (NFR-05c; end-to-end
  visibility proven in M-06.1).
- In-stream failure: one `event: error\ndata: {"status":…,"error":…}\n\n` with the StatusPages-mirroring
  texts (`LLM provider is unavailable` 503 / `Database is unavailable` 503 / `Internal server error` 500
  / the weather exception message), then close; a client disconnect cancels without an `outbound` line
  (D-12) where the test can express it.
- `outbound` per request: `status=200` with the terminal frame body (done or error) for the streamed
  path; `400`/`503` with the JSON error body for pre-stream failures; one `req=` chain per request
  (`ChatRoutesTest` via `LogCapture`).
- `Routing.kt` change is only the `chatRoutes()` call; `/weather`, `/fueling`, `/time` behavior is
  untouched (`./gradlew test` green).

**T-10 — Offline chain integration + backend gate.**
- One `testApplication` chain with the real `KoogChatAgent`, the chat registry backed by real tools with
  fakes and a scripted executor produces: byte-exact chunk/done frames; a single `req=` chain containing
  `inbound`, `deepseek-request` (with `messages=[system … history …]` proving replay), `deepseek-response`,
  `tool`, the tool's `db` line, a second `deepseek-request` with `streaming=true`, and `outbound
  status=200` with the `done` body.
- A two-turn history request (user + assistant + new user) shows the earlier turns in order in the first
  `deepseek-request` line (FR-12; the offline proxy for E2E-2).
- With a scripted stepwise stream, at least 2 chunk frames are produced before the terminal frame
  (NFR-05c offline proxy).
- Captured lines contain no secret (sentinel key never appears in frames or `LogCapture` output).
- Full-suite gate: `./gradlew test` → `BUILD SUCCESSFUL`; the 250 pre-existing test methods still
  execute and pass with the single recorded exception (T-07); the tester reports the observed total test
  count as a verdict.
- Backend diff reviewed by `code-style-checker`, `reviewer-correctness`, `reviewer-deduplication`,
  `reviewer-git`; findings resolved or recorded.

**T-11 — Frontend scaffold + tooling.**
- Scaffolded per the design's recorded procedure in `/Users/murkka/Work/ai-turbo-web` (existing-files
  handling via "Ignore files and continue" or the temporary-directory copy); template demo content
  (`src/App.css`, `src/assets/`, demo `App.tsx`/`index.css` bodies) removed; `CLAUDE.md`,
  `CODE_STYLE.md`, `.claude/`, `docs/` byte-unchanged.
- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `typecheck` (`tsc -b`), `test`
  (`vitest run`), `test:watch`, `preview`; dev-only additions `vitest`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` with the resolved
  versions recorded in `package.json`/lockfile; no runtime dependency beyond React/Vite (no state/CSS/
  HTTP library).
- `vite.config.ts`: `defineConfig` from `vitest/config`, react plugin, dev proxy `/chat` →
  `http://localhost:8080` with `changeOrigin: true` and no rewrite, `test: { environment: 'jsdom',
  setupFiles: './src/test/setup.ts' }`. `src/test/setup.ts`: jest-dom import + `afterEach(cleanup)`.
- `npm run test` exits 0 with a placeholder/smoke test with the backend stopped; `npm run build` and
  `npm run typecheck` success verdicts; grep finds no key/password/token.

**T-12 — `types.ts` + SSE parser.**
- `src/types.ts` exports exactly `MessageRole`, `MessageKind`, `ChatMessage {id, kind, content}`,
  `ModelChoice`; no `any` without a narrowing justification; no other exports.
- Parser semantics: frames split on `\n` and `\r\n`; exactly one leading space after `data:` is stripped
  (the backend writes `data: {…}`); multiple `data:` lines join with `\n`; comment lines (`:`), `id:`,
  `retry:` and blank separators are ignored; a partial frame survives across `push` calls and is emitted
  only when its blank-line terminator arrives.
- Tests include the split cases: a frame split between `\r` and `\n` across two pushes, a split inside
  the JSON payload, two frames in one push plus a partial third, a `data:` line split across pushes, a
  comment-only frame, and a trailing incomplete frame that emits nothing.
- `npm run test` exits 0 offline.

**T-13 — `chatApi.streamChat`.**
- `API_BASE_URL` is exactly the designed constant (`VITE_API_BASE_URL` override, `''` in dev, the
  `http://localhost:8080` default otherwise).
- The request is `POST ${API_BASE_URL}/chat` with `Content-Type: application/json`,
  `Accept: text/event-stream`, the serialized `{messages, model}` body and the optional `signal`
  (asserted on the mocked fetch call; the body contains no local-only fields).
- `!response.ok` → JSON `{error}` parsed into `ChatRequestError(message, status)`; a non-JSON body falls
  back to the status text; a non-`text/event-stream` content type throws
  `ChatRequestError('Неожиданный ответ сервера')`.
- Mocked `Response(new ReadableStream(…))`: each `chunk` frame calls `onChunk` once with its text and
  nothing is batched; `done` resolves with `answer`; an `error` frame throws `ChatRequestError(error,
  status)`; a stream ending without a terminal frame throws `ChatRequestError('Соединение прервано')`.
- The decoder runs with `{stream: true}`; a Cyrillic payload split across byte chunks decodes correctly.
- `chatApi.test.ts` is fully offline; `npm run test` green.

**T-14 — `chatStorage`.**
- Only the key `ai-turbo-chat-history` is read or written; nothing else is stored (FR-08/NFR-03).
- `loadMessages`: missing key, invalid JSON, non-array → `[]`; entry-level validation (types +
  `kind ∈ {user, assistant, error}`) drops invalid entries and keeps valid ones in order.
- `saveMessages` serializes in conversation order and never throws: a `setItem` that throws (quota or
  disabled storage) and a throwing `getItem` are both swallowed.
- Tests cover: round-trip; corrupted JSON; non-array; mixed valid/invalid entries; throwing storage on
  read and on write; `npm run test` green offline.

**T-15 — `useChat`.**
- Returns `{messages, model, setModel, isStreaming, send}`; initializes from `loadMessages()`; the model
  defaults to `deepseek` on mount and is not persisted (D-17).
- `send`: blank/whitespace input is ignored; sends while `isStreaming` are ignored; the user message is
  appended immediately; `isStreaming` is true synchronously from send until the terminal; an assistant
  placeholder is created and each streamed chunk is appended to it in order, with no batching.
- Request mapping: the current list is filtered (no `kind: 'error'`) and stripped to `{role, content}`,
  ending with the new user turn; `model` is always sent; a follow-up after a weather answer carries the
  earlier user and assistant turns in order (FR-04).
- Failure: the placeholder is discarded, an `error` entry (message from `ChatRequestError`) is appended,
  the user turn and all earlier turns remain, and the next send works; an in-flight request is aborted on
  unmount without appending an error entry.
- Persistence: a `useEffect` on `messages` saves via `saveMessages`; remounting after ≥ 2 turns restores
  the same messages in the same order (including error entries).
- `useChat.test.tsx` mocks the api module (no network); `npm run test` green.

**T-16 — Message list components.**
- `MessageBubble` renders plain text only (no markdown, no `dangerouslySetInnerHTML`) with
  `aria-label` «Сообщение пользователя»/«Ответ ассистента» and distinct classes
  `message--user`/`message--assistant`; `ErrorBanner` has `role="alert"` and class
  `message message--error`.
- `MessageList` has `role="log"` and `aria-live="polite"`; it maps each message to a bubble or the error
  banner; while `isStreaming` it renders the activity indicator (`role="status"`, «Ассистент
  печатает…») for the in-progress assistant message only.
- `ChatWindow` pins to the newest content (`scrollIntoView({block:'nearest'})` spy) only when the user is
  near the bottom; it does not yank the view when the user scrolled up.
- `MessageList.test.tsx` covers user/assistant/error rendering, the indicator visibility and the scroll
  behavior; `npm run test` green.

**T-17 — Chat input + model selector.**
- `ChatInput`: input + send button with a visual-hidden label or `aria-label`; Enter sends; blank or
  whitespace-only input cannot be sent (button disabled, Enter no-op); both are disabled while
  `isStreaming`; the text is cleared on send and focus is kept after send.
- `ModelSelector`: label + `<select>` with `local`/`deepseek`, value bound to the current model, default
  `deepseek`, change calls `setModel`.
- Tests use RTL + user-event; `npm run test` green offline.

**T-18 — App shell + styles + App test.**
- `App` composes the header (title + `ModelSelector`), `ChatWindow` and `ChatInput` from `useChat()`;
  `main.tsx` renders under `StrictMode`; `index.css` provides plain-CSS bubbles/layout and the indicator
  animation; no CSS framework import.
- `App.test.tsx` (mocked `streamChat`): sending renders the user bubble at once, the assistant bubble
  grows from the streamed chunks with the indicator visible during flight, and the final text matches;
  an error path shows the banner with the history intact and the app still usable.
- `npm run build` and `npm run typecheck` success verdicts; `npm run test` green offline.

**T-19 — Frontend offline gate + reviews.**
- `npm run test` exits 0 with the backend stopped and no network; coverage includes the NFR-01 minimum:
  history persistence and restore, the full history in the request body, incremental chunk append, error
  display with preserved history.
- `npm run build` and `npm run typecheck` success verdicts; runtime dependency list contains no
  state-management, CSS-framework or HTTP-client library.
- Greps over tracked files and `localStorage` usage: 0 secrets; only `ai-turbo-chat-history` is written.
- Frontend diff reviewed by `code-style-checker` (including no unjustified `any`),
  `reviewer-correctness`, `reviewer-deduplication`, `reviewer-git`; findings resolved or recorded with
  T-IDs. All output read as verdicts only.

**T-20 — Docs.**
- Backend `README.md`: a `/chat` section with the request body, `model` rules, the frame contract
  (`chunk`/`done`/`error` examples), the pre-stream `400`/`503` note, the `curl -N` example, the trace
  chain and the Postman note (SSE response; use `curl -N` if Postman buffers); existing sections
  untouched; no secret, no pasted build output.
- Frontend `README.md`: `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm run test`;
  the dev proxy and `VITE_API_BASE_URL`; a short "reproduce E2E-1" walkthrough (start backend → start
  dev server → ask the weather question).
- A reader who follows only the READMEs can reproduce E2E-1 (checked by the tester); no documented
  contract contradicts shipped behavior.

## Traceability matrix

| Requirement | Covered by tasks | Milestone / E2E evidence |
|---|---|---|
| FR-01 | T-11, T-19 | M-04 build/typecheck; M-05 suite |
| FR-02 | T-15, T-16, T-17, T-18 | M-04; M-06.2 |
| FR-03 | T-14, T-15 | M-04 tests; M-06.6 |
| FR-04 | T-15, T-13 | M-04 tests; M-06.3 |
| FR-05 | T-09, T-13, T-15, T-16 | M-02/M-03 tests; M-06.2 |
| FR-06 | T-13, T-15, T-17 | M-04 tests; M-06.5 |
| FR-07 | T-09, T-13, T-15, T-16 | M-03 tests; M-06.5 |
| FR-08 | T-11, T-13, T-19 | M-05 checks; M-06.2 (no CORS) |
| FR-09 | T-02, T-05, T-09 | M-03 tests; M-06.1 |
| FR-10 | T-09, T-10, T-13 | M-03 tests; M-06.1 |
| FR-11 | T-04, T-08, T-10 | M-02/M-03 tests; M-06.2, M-06.4 |
| FR-12 | T-04, T-10 | M-03 tests; M-06.3 |
| FR-13 | T-06, T-08, T-09 | M-02/M-03 tests; M-06.5 |
| FR-14 | T-07, T-09, T-10 | M-03 tests; M-06.2 |
| FR-15 | T-08, T-10, T-19 | M-03 gate; M-06.7 |
| FR-16 | T-10 | M-03 tests; M-06.2 |
| FR-17 | T-04, T-10 | M-03 tests; M-06.3 |
| FR-18 | T-10 | M-03 tests; M-06.4 |
| FR-19 | T-05, T-06, T-13, T-15 | M-03/M-04 tests; M-06.5 |
| FR-20 | T-14, T-15 | M-04 tests; M-06.6 |
| FR-21 | All tasks; review gates in T-10, T-19 and milestones M-03/M-05 | Implementation record + review runs |
| FR-22 | T-20 | M-05 reproduction check |
| NFR-01 | T-12, T-13, T-14, T-15, T-16, T-17, T-18, T-19 | M-05 `npm run test` offline |
| NFR-02 | T-02–T-10 (test co-location), T-10 (gate) | M-01/M-02/M-03 `./gradlew test` verdicts |
| NFR-03 | T-05, T-07, T-10, T-19, T-20 | M-05 greps; M-06.2 (grep chain) |
| NFR-04 | T-08, T-10, T-11, T-19 | M-03 gate; M-05 deps check; M-06.7 |
| NFR-05 | T-04, T-07, T-09, T-13, T-15 | M-02/M-03 tests; M-06.1/M-06.2 visibility |
| NFR-06 | T-07, T-09, T-10 | M-03 chain test; M-06.2 grep |
| NFR-07 | T-11, T-13, T-14 | M-06 browser checks in Chrome/Safari |
| NFR-08 | All tasks (cross-cutting rules); gates T-10, T-19 | Milestone exits; review agents |

All 22 FRs and all 8 NFRs are covered by at least one task; no gaps. The requirements' assumptions
(ASM-01…ASM-13) and the design's recorded deviations (OQ-A…OQ-F, D-11) are inherited as-is; no plan task
may change them silently (deviation protocol).

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Koog 1.2.0 API drift vs `02-design.md` (`requestLLMStreaming` appending the reply; `appendPrompt` history replay shape; builder/`StreamFrame` signatures) | Med | High | T-01 compile-first probe of every used API plus the D-04 "does not self-append" check from the resolved sources; a mismatch is escalated via the deviation protocol before T-04; no workaround is invented in code | Developer (backend), escalation via orchestrator |
| R-02 | Ollama streaming drops tool definitions, so a streamed first round would silently break tools for `model=local`; the streamed local trace line reports `tools_count=2` while the wire carried none | High (known Koog 1.2.0 fact) | Med | Hybrid pattern D-04 enforced: round 0 non-streamed, streaming only after tool results; T-04/T-06 assert the non-streamed first round; the cosmetic trace mismatch is documented, not "fixed" | Developer (backend); reviewer-correctness |
| R-03 | DeepSeek streamed-round tool-call assembly (`ToolCallComplete`) misbehaves when a tool call appears inside a streamed round | Med | Med | T-04 scripted scenario with a tool call inside the streamed round + T-10 chain + M-06; if it misbehaves, the loop simply stops after the executed first tool and the answer still derives from the tool result (design risk 3); observed behavior is recorded | Developer (backend); tester |
| R-04 | `respondTextWriter` flush granularity cannot be proven by unit tests — the stream may arrive only at the end | Med | High | Per-frame flush in T-09; M-06.1 `curl -N` check before declaring done; recorded fallback: `ktor-server-sse` (ASM-12) or writing through the engine output stream, with a recorded decision | Developer (backend); tester (E2E) |
| R-05 | SSE buffered by the Vite dev proxy → "answer appears at once" in the browser | Low | Med | Proxy `changeOrigin: true`, no rewrites, no compression on either side; M-06 checks the browser path as well as direct `curl -N`; if buffering: verify direct-vs-proxy, workaround `VITE_API_BASE_URL=http://localhost:8080` (recorded) | Developer (frontend); tester |
| R-06 | The one frozen `LoggingPromptExecutor` streaming assertion changes (1 line → 2) and could be read as a weakened contract | Certain (by design, D-11) | Low | Recorded exception: the expectation strengthens the contract; flagged to `code-style-checker`/`reviewer-correctness`/`reviewer-git` in the implementation record; all other assertions byte-unchanged | Developer (backend); reviewer |
| R-07 | Fetch-stream parsing edge cases: frame split between `\r` and `\n`, split mid-JSON, multiple `data:` lines, partial buffer, leading space after `data:` | Med | Med | T-12 tests the full matrix incl. cross-chunk splits; `TextDecoder({stream:true})` in T-13 with a Cyrillic multi-byte split case; T-15 asserts per-frame append without batching | Developer (frontend); tester |
| R-08 | `localStorage` quota/disabled storage or corrupted payload breaks the app | Low | Med | T-14: `saveMessages` in `try/catch`, invalid JSON/non-array → `[]`, per-entry validation drops invalid entries; tests simulate throwing get/set and corrupted JSON | Developer (frontend) |
| R-09 | Two-project coordination/contract drift (frontend building against a different frame/error shape) | Med | Med | Backend first: M-03 freezes the contract before any T-11+ work; both sides assert the byte-exact strings from `02-design.md` (T-10, T-13); any contract change goes through the recorded-decision/deviation protocol, not a silent edit | Orchestrator (deviation protocol); both developers |
| R-10 | No history cap (D-16/OQ-E): a long session exceeds the model context window | Low | Med | Accepted v1 assumption; the failure surfaces as an error frame with the history intact (T-09 error path); a cap would be a recorded follow-up decision, never silent truncation | Developer; user (recorded assumption) |
| R-11 | Live E2E prerequisites missing (Ollama/`qwen3:8b`, local DB container, stage DB, `.env` key) | Med | Low | M-06 prerequisite block lists the checks; all automated suites stay offline and independent of them; a missing prerequisite blocks M-06 rather than being faked | Tester |
| R-12 | Frontend dev-dependency versions (vitest/RTL/jsdom) conflict with the scaffolded Vite/React versions | Med | Low | Versions resolved and recorded at T-11 install time (D-14); on a peer conflict, adjust to compatible majors and record; no runtime dependency is added either way | Developer (frontend); code-style-checker |

## Definition of Done (feature level)

1. All tasks T-01…T-20 are done; milestones M-01…M-06 have their exits verified and recorded.
2. `./gradlew test` in `/Users/murkka/Work/ai-project` reads `BUILD SUCCESSFUL`; the 250 pre-existing
   tests are green; the only changed pre-existing expectation is the recorded `LoggingPromptExecutorTest`
   streaming line (D-11), flagged to the reviewers.
3. `npm run test` in `/Users/murkka/Work/ai-turbo-web` exits 0 with the backend stopped; `npm run build`
   and `npm run typecheck` read success; NFR-01's minimum scenarios are covered.
4. The `POST /chat` contract matches `02-design.md`: zero or more `chunk` frames, exactly one terminal
   `done`/`error` frame, `done.answer` equals the chunk concatenation, pre-stream `400`/`503` stay JSON;
   `curl -N` shows frames incrementally (M-06.1).
5. E2E-1…E2E-7 pass per the M-06 checklist: weather question streamed with a `get_weather` tool line; a
   follow-up answered from history (Moscow not repeated); the fueling GUID answered with `find_fueling`
   and `lookup=found` in the same chat; both providers streaming (`local` with Ollama, `deepseek`), with
   the Ollama-down case showing an error and keeping the history; page reload restores the history; the
   backend suite is green.
6. `/weather`, `/weather/history`, `/fueling`, `/time`, `GET /` contracts, status codes and trace shapes
   are unchanged; the tools and their JSON resources are byte-identical; weather/fueling registries stay
   single-tool; no new backend dependency, no `application.conf` change.
7. Zero secrets in the frontend, logs, frames and docs; `localStorage` holds only
   `ai-turbo-chat-history`; backend secrets remain only in the git-ignored `.env`.
8. The READMEs allow reproducing E2E-1; `01-requirements.md`, `02-design.md`, `03-plan.md` and `spec.md`
   are consistent; any deviation is recorded.
9. Harness discipline held: verdict-only build/test reading, logs only via `req=`/`stage=` grep, offline
   tests only, reviews by the four project agents in both repositories, no commit or push without an
   explicit user request.
