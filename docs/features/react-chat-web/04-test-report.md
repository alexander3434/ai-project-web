# React Chat Web — Test Report

- **Date:** 2026-09-30
- **Tester:** tester agent (`/feature-implementation`), offline scope (M-01…M-05)
- **Spec:** `docs/features/react-chat-web/spec.md` (requirements + design + plan T-01…T-20, milestones M-01…M-05)
- **Projects:** backend `/Users/murkka/Work/ai-project`, frontend `/Users/murkka/Work/ai-turbo-web`
- **Overall verdict (offline scope): PASS.** Both suites are green and every automatable task criterion has
  automated evidence; M-06 (live E2E) is deferred to the orchestrator. The two process-evidence gaps this
  report initially raised are **resolved**: `06-implementation-record.md` now records the T-01 probe result,
  the deviations with evidence, the D-11 exception, the T-01…T-20 mapping and the review-run pointer to
  `05-review.md` (which exists), and `05-review.md` holds the review record.

## Scope

Tested (what changed, identified via `git status`/`git diff` in the backend and by file listing in the
frontend, which is not a git repository):

- **Backend (uncommitted diff, 7 files) + new files.** Modified: `Application.kt`, `plugins/Routing.kt`,
  `llm/ProviderRoutingPromptExecutor.kt`, `log/LoggingPromptExecutor.kt`, `README.md`,
  `test/LoggingPromptExecutorTest.kt`, `test/ProviderRoutingPromptExecutorTest.kt`. New main:
  `chat/{ChatAgent,ChatRequestValidator,KoogChatAgent}.kt`, `llm/{StreamedAssistant,ProviderAvailability}.kt`,
  `plugins/ChatRouting.kt`. New tests: `ChatRequestValidatorTest`, `StreamedAssistantTest`,
  `KoogChatAgentTest`, `ProviderAvailabilityTest`, `ChatModulesTest`, `ChatRoutesTest`,
  `ChatChainIntegrationTest`.
- **Frontend (new project, 27 source files).** `package.json`/lockfile, `tsconfig*.json`, `vite.config.ts`,
  `index.html`, `.oxlintrc.json`, `.gitignore`, `public/favicon.svg`, `README.md`, `src/main.tsx`,
  `src/App.tsx`, `src/index.css`, `src/types.ts`, `src/api/{sse,chatApi}.ts`, `src/hooks/{chatStorage,useChat}.ts`,
  `src/components/{ChatWindow,MessageList,MessageBubble,ErrorBanner,ChatInput,ModelSelector}.tsx`,
  `src/test/setup.ts` and the 8 co-located test files.
- **Verification method.** Full read-through of the new/changed production and test sources; both suites
  executed for real (`./gradlew cleanTest test`, `npm run test`, `npm run typecheck`, `npm run build`,
  `npm run lint`); frozen-test accounting by diff inspection; hygiene by grep/finding. No production code
  and no test file was modified by this run; no backend, Vite dev server, LLM, Ollama or database was
  started.

Deliberately not tested (and why):

- **M-06 live E2E (E2E-1…E2E-7)** — needs `./gradlew run`, the Vite dev server, a live DeepSeek key /
  Ollama `qwen3:8b`, the local DB and the stage DB; explicitly the orchestrator's manual step. The offline
  suite only proves the shapes; the live chain, `curl -N` flush granularity (R-04) and Vite-proxy
  buffering (R-05) remain manual.
- **NFR-05(a)(b) timings** — "indicator within 200 ms", "chunk rendered within 100 ms" are browserdevtools
  measurements; the suite proves the synchronous/monotonic behaviour (`isStreaming` true from `send`,
  one append per `chunk`, no batching), not wall-clock latency.
- **NFR-07 browser matrix** (Chrome/Safari) — manual.
- **Existing `/weather`, `/fueling`, `/time`, `GET /` live behaviour** — covered offline by the pre-existing
  tests (all green); the documented live curl/documented-body checks are M-06.7.

## Coverage of acceptance criteria

Levels: U = unit, I = integration (testApplication/route+agent chain), C = component (RTL), E = end-to-end
(offline proxy), G = gate (build/lint/verdict), M = manual.

### Backend tasks

| Criterion (plan) | Test(s) | Level | Status |
|---|---|---|---|
| T-01 Koog 1.2.0 API probe compiles every used API; probe deleted; suite green; *result recorded* | Probe file `KoogApiProbeTest.kt` is absent; every probed API is compiled and exercised by `KoogChatAgentTest`/`ChatChainIntegrationTest`; suite green; probe result + D-04 fact recorded in `06-implementation-record.md` §1 | I | PASS |
| T-02 validator matrix + exact texts + `toSession` + DTO behaviour | `ChatRequestValidatorTest`: `a valid request passes and maps to the session`, `a single user message maps to an empty history`, `roles are trimmed and case-insensitive`, `an empty message list is rejected with the exact text`, `a system role is rejected at its index`, `an unknown role is rejected at its index`, `a blank content is rejected at its index`, `a last message from the assistant is rejected`, `a role is checked before the content of the same message` (missing-field defaults), `the request tolerates unknown extra fields`, `an absent model stays out of the re-encoded trace body and a sent one is kept`, `frame DTOs encode as single-line compact JSON`. HTTP level: `ChatRoutesTest.validation failures stay JSON and never open the stream` (all 5 texts + JSON content type + 0 agent calls + no provider/tool lines) | U + I | PASS |
| T-03 `StreamedAssistant` accumulator | `StreamedAssistantTest`: `deltas are concatenated in order and become the text part`, `a tool call is assembled next to the text`, `a trailing TextComplete never double-counts`, `tool call deltas alone do not become a tool call`, `an empty stream yields an empty message`, `accepting the same frame twice accumulates twice` | U | PASS |
| T-04 `KoogChatAgent` + combined prompt: history replay, tool round non-streamed → streamed round, manual append, fallback, non-convergence, OQ-A single piece | `KoogChatAgentTest`: `history is replayed in order behind the system prompt with the new message last`, `a tool call is executed non-streamed and the next round streams its result back` (asserts `stage=tool tool=get_weather`, `executeCalls=1` round 0, `streamingCalls=1`), `the assembled streamed answer is appended by hand before the next round`, `a direct answer is emitted as one piece without any streamed round`, `a blank streamed answer falls back to the shared text`, `a non-converging tool loop is stopped with the same warning` | I | PASS |
| T-05 `ProviderAvailability` | `ProviderAvailabilityTest`: `an unconfigured deepseek target is reported with the 503 text`, `a configured deepseek target is available`, `the local target is always available`, `the value carries a boolean only, no key material` | U | PASS |
| T-06 resolved-model streaming overload routes at collection time; blank key throws | `ProviderRoutingPromptExecutorTest`: `the resolved-model streaming overload routes like the plain one` (built outside, collected inside `LlmTargetContext`; local gets `qwen3:8b`, deepseek keeps `ResolvedModel`), `resolved-model streaming with a blank key fails at collection time` | U | PASS |
| T-07 streamed outcome line: request line first, one assembled response line, frames untouched, failure/cancellation paths | `LoggingPromptExecutorTest`: updated `executeStreaming logs the request with the streaming flag and the assembled outcome` (2 lines; `streaming=true`; assembled `text="…"` + `tool_calls=[]`, frames equal to the scripted ones), `executeStreaming logs a tool call assembled from the frames`, `a mid-stream failure is logged after the frames that were already sent and rethrown`, `a cancellation during the stream is rethrown without a response line` | U | PASS |
| T-08 `chatModule` + availability binding; registries single-tool; blank key builds | `ChatModulesTest`: `the chat registry holds both tools while the other registries stay single-tool`, `the chat registry shares the tool singletons instead of copying them`, `the agent binding resolves to the Koog chat agent over the chat registry`, `a blank key still builds the graph and flips only the deepseek availability flag`, `a configured key makes the deepseek target available` | I | PASS |
| T-09 `POST /chat`: order, byte-exact frames, pre-stream JSON 400/503, in-stream error frame, cancellation, `outbound`, context, flush | `ChatRoutesTest`: `two chunks are streamed as byte-exact frames and closed by the done frame` (+ agent runs inside `withContext(trace + LlmTargetContext)` and `outbound status=200` body), `the history is mapped to the session and model=local is echoed`, `validation failures stay JSON and never open the stream`, `a blank deepseek key answers 503 JSON while local still streams` (503 body + `outbound status=503`), `an in-stream failure becomes one error frame with the mirrored text` (503/503/503/500 texts), `a cancelled stream ends without a terminal frame and without an outbound line`, `a malformed body keeps the StatusPages answer and logs no inbound body`, `the session of an empty history keeps the new message only` | I | PASS |
| T-10 offline chain through the real agent + chat registry + scripted executor; history in `deepseek-request`; `tool`/`db`; `streaming=true`; `outbound`; ≥2 chunks; no secret; full-suite gate | `ChatChainIntegrationTest`: `one chat turn writes the whole chain and streams the answer` (stage order `inbound, deepseek-request, deepseek-response, db, tool, deepseek-request, deepseek-response, outbound`, one `req=`, `tools_count=2` both rounds, history `[system, user, assistant, user]`, `streaming=true` second round, key fixture absent from frames and log), `at least two chunks arrive before the terminal frame` (3 chunks), `a tool that returns no data still ends the turn with the done frame`; gate: `./gradlew cleanTest test` → BUILD SUCCESSFUL, 299/0 | E + G | PASS |

### Frontend tasks

| Criterion (plan) | Test(s) | Level | Status |
|---|---|---|---|
| T-11 scaffold + tooling: scripts, proxy, Vitest config, setup, no runtime libs, no secrets | Inspection: `package.json` scripts `dev/build/typecheck/test/test:watch/preview` (+`lint`), `vite.config.ts` (react plugin, `/chat` proxy `changeOrigin: true`, `jsdom` + `setupFiles`), `src/test/setup.ts` (jest-dom + `afterEach(cleanup)`), deps = react/react-dom only. Gates: `npm run test` 59/59, `npm run build` success, `npm run typecheck` exit 0, `npm run lint` clean | G | PASS (two recorded deviations, see below) |
| T-12 `types.ts` + SSE parser semantics incl. split frames | `src/api/sse.test.ts` (11): whole frames, `\r\n`/bare `\r`, one-space strip, multi-`data` join + `id`/`retry`/comments ignored, default event name, comment-only frame, partial frame across pushes, split between `\r` and `\n`, split inside a `data:` line, two frames + partial third in one push, trailing incomplete frame | U | PASS |
| T-13 `chatApi.streamChat` | `src/api/chatApi.test.ts` (12): `API_BASE_URL` dev/prod/env, POST headers/body/signal, chunk delivery without batching, Cyrillic payload split across byte chunks, `{error}` JSON → `ChatRequestError(message, status)`, non-JSON fallback to status text, wrong content type, error frame with status, `Соединение прервано` | U | PASS |
| T-14 `chatStorage` | `src/hooks/chatStorage.test.ts` (8): round-trip, writes only `ai-turbo-chat-history`, missing key/corrupted JSON/non-array → `[]`, mixed entries filtered, throwing read and write swallowed | U | PASS |
| T-15 `useChat` | `src/hooks/useChat.test.tsx` (10): restore + default `deepseek`, immediate user turn + per-chunk placeholder growth, full history stripped of error entries and local fields + `model`, selected model sent, blank/first-flight sends ignored, trimmed content, error entry replaces placeholder and keeps history, next send works, persistence + remount restore incl. error entries, abort on unmount | U | PASS |
| T-16 message list components | `src/components/MessageList.test.tsx` (7): user/assistant bubbles in order, error alert banner, plain text, `role=status` indicator only for the in-progress answer, `role=log`/`aria-live=polite`, scroll pinning near the bottom, no yank when scrolled up | C | PASS |
| T-17 input + selector | `src/components/ChatInput.test.tsx` (4): Enter sends + clears + keeps focus, button sends, blank/whitespace blocked, disabled while streaming; `ModelSelector.test.tsx` (2): current value + both options, change reported | C | PASS |
| T-18 App shell + styles + App test; build/typecheck | `src/App.test.tsx` (5): empty shell + selector, user turn at once + growth from chunks, error banner with history intact and app usable, chosen provider sent, restore on next visit; `npm run build`/`typecheck` success; `StrictMode` in `main.tsx`; plain CSS in `index.css` | C + G | PASS |
| T-19 frontend offline gate + reviews | Verdicts observed (`test` 59/59 with no backend, `build`, `typecheck`, `lint`); runtime deps clean; secrets grep 0; only `ai-turbo-chat-history` written. Review-agent runs recorded in `06-implementation-record.md` §5 with the record in `05-review.md` | G | PASS |
| T-20 docs | Backend `README.md` `/chat` section (request/model rules, frames, pre-stream 400/503, `curl -N` example, follow-up example, Postman note, full trace chain), frontend `README.md` (install/dev/build/typecheck/test/preview/lint, proxy + `VITE_API_BASE_URL`, E2E-1 reproduction, trace greps). No contradicting contract found by reading; the live reproduction itself is M-06 | M (doc review) | PASS |

FR/NFR traceability: all 22 FRs and 8 NFRs reach at least one of the task rows above (the plan's
traceability matrix is the cross-check); FR-16…FR-20 have their offline proxies in T-10/T-13/T-14/T-15
and their live evidence in M-06.

## Results

Commands actually executed (verdicts only, per CLAUDE.md discipline):

| Command | Observed |
|---|---|
| `cd /Users/murkka/Work/ai-project && ./gradlew cleanTest test` | **BUILD SUCCESSFUL** (exit 0); `:cleanTest` + `:test` executed |
| backend test results (`build/test-results/test/*.xml`, 41 files) | **299 tests, 0 failures, 0 errors, 0 skipped**, 41 classes |
| `cd /Users/murkka/Work/ai-turbo-web && npm run test` | exit 0 — **8 test files passed, 59 tests passed, 0 skipped** (1.27 s, offline: no backend running) |
| `cd /Users/murkka/Work/ai-turbo-web && npm run typecheck` | exit 0, no diagnostics |
| `cd /Users/murkka/Work/ai-turbo-web && npm run build` | exit 0 (`✓ built in 83ms`) |
| `cd /Users/murkka/Work/ai-turbo-web && npm run lint` | exit 0, no findings (oxlint) |

Backend accounting: 299 executed = 250 pre-existing (34 classes) + 49 new (44 in 7 new classes + 3 added
in `LoggingPromptExecutorTest` + 2 added in `ProviderRoutingPromptExecutorTest`). Frontend: 59 = sse 11 +
chatApi 12 + chatStorage 8 + useChat 10 + MessageList 7 + ChatInput 4 + ModelSelector 2 + App 5.

### Frozen-test accounting (NFR-02, D-11)

- Exactly **two** pre-existing test files were modified; the other **32 pre-existing test classes are
  byte-unchanged**; the tools, their JSON resources and `build.gradle.kts`/`application.conf` are untouched.
- `LoggingPromptExecutorTest` — one pre-existing expectation changed as recorded: the streamed call now
  asserts **2** trace lines (request with `streaming=true` + assembled `stage=deepseek-response`) instead
  of 1. The frame-forwarding assertion (`assertEquals(frames, received)`) is retained, so the contract is
  strengthened, not weakened; the test was also renamed and its frame fixture extended and 3 new tests
  were added. Slightly broader than "one assertion" but strictly additive in strength — acceptable.
- `ProviderRoutingPromptExecutorTest` — additions only (recording fields + 2 new tests); **zero** existing
  assertions changed.
- **249 pre-existing tests are byte-unchanged**, as required.

## Hygiene checks

| Check | Result |
|---|---|
| Frontend runtime deps | `react`, `react-dom` only — no state/CSS/HTTP library |
| Frontend dev deps | recorded in `package.json` + lockfile: vitest 5.0.2, jsdom 30.1.1, RTL 16.3.3, jest-dom 7.0.1, user-event 14.6.7, oxlint 1.81.0, `@types/node` (template/tooling only) |
| Secrets in frontend | grep over `src/`, `public/`, `index.html`, `vite.config.ts`, `README.md`, `package.json` → 0 secrets; no `.env` file; the only "API key" hit is the mocked backend error string in `chatApi.test.ts` |
| `localStorage` usage | only `ai-turbo-chat-history` read/written (`chatStorage.ts`); asserted by `chatStorage.test.ts` |
| Harness files untouched | `CLAUDE.md`, `CODE_STYLE.md`, `.claude/`, `docs/` all carry pre-scaffold mtimes; `docs/` still holds only 01/02/03/spec |
| No `any` / unsafe HTML | 0 hits for `: any`, `as any`, `dangerouslySetInnerHTML`; no `axios`/`EventSource` (fetch + ReadableStream as designed) |
| Backend dependency / config | `git diff build.gradle.kts` and `src/main/resources/application.conf` empty; `ktor-server-sse` not added (D-05) |
| Backend additive-ness | `Routing.kt` change is one `chatRoutes()` line; tools/resources/weather+fueling registries untouched; DI additions only (`ProviderAvailability`, `chatModule`) |
| Backend secrets | diff + new chat sources grep → 0 key/password material; `.env` remains git-ignored |
| Frontend VCS | the frontend project is **not** a git repository, so a diff-based `reviewer-git` pass is impossible — review must be by file listing (observation, not a defect) |

## Deviations assessment

The items below were detected independently from the diff and assessed against the spec (the list was not
supplied to this run). `06-implementation-record.md` §2 now records the same set as a superset (6 backend +
5 frontend deviations, including four items not visible from behaviour alone: the inherited malformed-body
`Invalid request` text, the `ResolvedModel` pass-through in T-06, the no-mirror-override finding in T-07 and
the T-10 test-only fixtures). Cross-check: my items 2–6 match the record's frontend list; my item 1 matches
the record's backend item 1. All are behaviour-preserving and, in my judgement, acceptable.

| # | Detected deviation | Basis in spec | Assessment |
|---|---|---|---|
| 1 | Backend DTO named `ChatTurnDto` (design: `ChatMessageDto`) | Design `## Components`/file inventory | **Acceptable / necessary** — the frozen static guard `RawDeepSeekCallTest` matches by substring `class ChatMessage`, so the designed name would have broken 1 pre-existing test; the wire shape (`role`/`content`) is unchanged and the reason is documented in the class KDoc. Modifying the frozen test instead would violate NFR-02. |
| 2 | Frontend uses **oxlint** (`.oxlintrc.json`, `oxlint` devDep, `lint` script) instead of the scaffold's ESLint, and the plan's `eslint.config.js` is absent | T-11 file list; D-14 dev-dep list | **Acceptable** — neither `CODE_STYLE.md` nor any requirement mandates ESLint; dev-only, no runtime/build impact; `npm run lint` is clean. Should be recorded as an extra dev dependency (T-11/T-19 "resolved versions recorded"). |
| 3 | `src/test/setup.ts` also stubs `Element.prototype.scrollIntoView` | Design scaffolding section | **Acceptable** — jsdom does not implement scrolling; test-only shim needed by `ChatWindow`; no production behaviour affected. |
| 4 | SSE parser defaults a missing `event:` line to `'message'` | Design `sse.ts` contract (silent on the default) | **Acceptable** — the backend always emits `event:`; an unlabelled frame is ignored by the client anyway; covered by a dedicated test. |
| 5 | Defensive additions in the client: `response.body === null` → `Соединение прервано`, and `useChat`'s `FALLBACK_ERROR = 'Не удалось получить ответ'` for empty error text | FR-07/FR-10 error semantics | **Acceptable** — strengthens the "never a silent hang / error is shown" contract; no documented text is contradicted. |
| 6 | Dependency-version drift from the design's assumptions: Vite 8.3.0, React 19.2.8, TypeScript ~6.0.2, Vitest 5.0.2, jsdom 30, plus `@types/node` (template) | D-14 ("versions resolved by npm at implementation time and recorded") | **Acceptable by design** — D-14 explicitly delegates version resolution to install time; all versions are recorded in `package.json`/lockfile and all gates pass. Worth a line in the implementation record. |

Non-deviations verified: the hybrid streaming pattern (D-04), the SSE-over-POST implementation with no
new dependency (D-05), the three frame types (D-06), the in-stream error mapping (D-08), the pre-stream
503 (D-09), the routing override (D-10), the new response line (D-11), the error entry / discarded
placeholder (D-13) and the no-history-cap behaviour (D-16) are all implemented as designed.

## Bugs found

**None.** No implementation defect was observed in the offline scope: every executed assertion passes,
the byte-exact frame contract holds (`done.answer` = concatenation of chunks; exactly one terminal frame),
pre-stream failures stay JSON with the exact designed texts and no provider/tool line, the trace chain is
single-`req=` and ordered, and no secret reaches a frame or a log line.

## Gaps, risks and items to close before the feature is declared done

1. ~~No implementation record on disk~~ — **RESOLVED** (2026-09-30): `06-implementation-record.md` now
   records the T-01 probe findings with verified signatures, the backend and frontend deviations with
   evidence, the D-11 frozen-test exception and accounting, the T-01…T-20 status/evidence mapping, the
   verdict-only results section and the review-run pointer; `05-review.md` (the pointer target) exists.
   This closes FR-21 / feature-DoD #8 evidence. No code or test changed, so no suite was re-run for this.
2. **M-06 is unverified** — the whole live path: `curl -N` incremental flush (R-04), Vite dev-proxy
   buffering (R-05), real `get_weather`/`find_fueling` data, both providers, reload persistence, browser
   matrix (NFR-07), real trace-chain grep and secrets-in-log check (NFR-03/NFR-06).
3. **NFR-05(a)(b) timings** — only the behavioural proxies are automated; the 200 ms / 100 ms targets need
   devtools measurement during M-06.
4. **Frontend is not a git repository** — `reviewer-git` cannot diff it; if a review record is expected,
   decide whether to `git init` (out of this feature's scope; not requested).

## Manual checks

For the orchestrator's M-06 (exact commands in the plan's M-06 checklist):

1. `cd /Users/murkka/Work/ai-project && ./gradlew run` + `cd /Users/murkka/Work/ai-turbo-web && npm run dev`;
   ask «Какая сейчас погода в Москве?» → indicator within ~200 ms, ≥ 3 visible growth steps, answer matches
   the tool data (E2E-1/E2E-5).
2. `curl -N -X POST http://localhost:8080/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"local"}'`
   → frames visibly printed incrementally, then exactly one `done`; pre-stream `{"messages":[]}` → `400`
   JSON (M-06.1).
3. Follow-up «А завтра?» without reload → request body carries all three turns; `deepseek-request` shows the
   replay; second `get_weather` with Moscow (E2E-2).
4. Fueling GUID `61574131-999F-48C9-93AE-3EAA68562177` in the same chat → `tool=find_fueling`, `lookup=found`
   (E2E-3).
5. Both providers from the selector; stop Ollama and send with `local` → error in chat, history intact
   (E2E-4).
6. Reload → conversation restored in order; only the `ai-turbo-chat-history` key in Local Storage; next send
   carries the restored history (E2E-6).
7. `./gradlew test` → BUILD SUCCESSFUL; `/weather`, `/fueling`, `/time` live curl examples unchanged,
   `tools_count=1` preserved (E2E-7); grep the captured chain for secrets (NFR-03/NFR-06).

---

## M-06 live E2E record (2026-09-30, orchestrator)

Environment: backend on :8080 (fresh build with the D-18 client-disconnect guard, 303 tests green), local Docker Postgres up, stage reachable, Ollama running with qwen3:8b, Vite dev server on :5173.

| Check | Result |
|---|---|
| Backend `./gradlew test` | BUILD SUCCESSFUL (303/0) |
| Frontend `npm run test`/`typecheck`/`build`/`lint` | all exit 0 (59/59 tests) |
| E2E-1 weather via `POST /chat` (deepseek) | PASS — SSE chunks stream incrementally (`event: chunk` + `data: {"text":"…"}` per token), `done` frame, chain `inbound → deepseek-request → deepseek-response → db(saved=true) → tool → deepseek-request(streaming) → deepseek-response → outbound 200`, `tools_count=2` |
| E2E-2 follow-up with history | PASS — «А какая влажность?» после предыдущего хода дал 92% с новым вызовом тула; история replay видна в `deepseek-request` |
| E2E-3 fueling via chat | PASS — GUID из требований найден в `fuelings_archive`, ответ-сводка |
| E2E-4 `model=local` via chat | PARTIAL (environment): серверная сторона доказана логом (round 0 → tool call → `stage=db` → `stage=tool` → пост-тул раунд), но curl-клиенты из песочницы рвут соединение до первого байта (exit 52) и оставляют в Ollama «зомби»-генерации; фикс D-18 при обрыве клиента работает (тихий конец, без 500). UI-проверка локальной модели — через браузер (шаги ниже) |
| Client-disconnect robustness (D-18) | PASS — обрыв клиента → тихое завершение хода, без error-frame/500 (закреплено тестом) |
| Vite page | PASS — `http://localhost:5173/` отдаёт приложение (200) |

**Как проверить локальную модель в браузере (пользователю):** бэк и Vite уже запущены. Откройте http://localhost:5173, выберите «local» в селекторе модели, спросите «Какая погода в Москве?» — ответ придёт через ~1-2 минуты (CPU-инференс + тул). Если предыдущие оборванные запросы оставили очередь в Ollama — `ollama stop qwen3:8b` и повторите.
