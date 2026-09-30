# React Chat Web — Review

## Verdict: APPROVED

Re-review after the one major finding was closed. `06-implementation-record.md` now carries every
FR-21 item (T-01 probe result, the deviations with evidence, the D-11 accounting, the T-01…T-20
status/evidence mapping, the verification verdicts and the review-run pointer), and
`04-test-report.md` marks T-01/T-19 PASS and the record gap RESOLVED. No code changed between the
two review passes (backend `git status`/diffstat and all frontend sources byte-identical), so the
earlier code verdict stands: the backend diff is contract-faithful and additive, the frontend
matches `CODE_STYLE.md` and the design, both suites are green, and I re-verified the two load-bearing
Koog 1.2.0 facts directly from the resolved jars (`requestLLM` self-appends the assistant reply
while `requestLLMStreaming` does not; the `ResolvedModel` streaming default delegates to
`model.effectiveModel` on the same instance, so the D-11 outcome line is reached on the DeepSeek
path). Remaining findings are one minor and three nits — polish, none blocking.

## Compliance matrix

Statuses: PASS = satisfied with offline evidence; PASS* = satisfied offline, live confirmation is
the orchestrator's M-06 manual step.

| Criterion | Implementation evidence | Test evidence | Status |
|---|---|---|---|
| FR-01 frontend per CLAUDE.md/CODE_STYLE.md, build+typecheck green, no banned libs | `package.json` (deps react/react-dom only; scripts `dev/build/typecheck/test/test:watch/preview`, plus `lint`), `vite.config.ts:1-19`, `src/{api,components,hooks}`, `src/types.ts`, `src/App.tsx` | `npm run test` 59/59, `typecheck` exit 0, `build` exit 0, `lint` exit 0 | PASS |
| FR-02 chat UI: bubbles, input+send, immediate user turn, auto-follow | `components/ChatInput.tsx:22-46`, `components/MessageList.tsx:11-23`, `components/MessageBubble.tsx:13-25`, `components/ChatWindow.tsx:22-39` | `ChatInput.test.tsx` (4), `MessageList.test.tsx` (7, incl. scroll pinning both ways) | PASS |
| FR-03 history in `localStorage` `ai-turbo-chat-history`, restored in order, corrupted storage safe | `hooks/chatStorage.ts:4,20-39`, `hooks/useChat.ts:31,38-41` | `chatStorage.test.ts` (8: missing/corrupt/non-array/filtered/throwing get+set), `useChat.test.tsx:47-59,179-201` | PASS |
| FR-04 full session sent in order, local fields stripped | `hooks/useChat.ts:57-63` (error entries filtered, `{role,content}` only) | `useChat.test.tsx:89-110,138-146`; `chatApi.test.ts:67-81` (body has no local fields) | PASS |
| FR-05 live answer: per-chunk append + activity indicator | `hooks/useChat.ts:65-82`, `components/MessageBubble.tsx:19-24`, `components/MessageList.tsx:18` | `useChat.test.tsx:61-87`, `MessageList.test.tsx:44-56`, `App.test.tsx:58-83` | PASS* (visible ≥3 steps: M-06.2) |
| FR-06 model selector `local`/`deepseek`, default `deepseek`, sent per request | `components/ModelSelector.tsx:13-29`, `hooks/useChat.ts:32,62` | `ModelSelector.test.tsx` (2), `useChat.test.tsx:112-121`, `App.test.tsx:109-119` | PASS |
| FR-07 failures as a distinct error entry, history preserved, app usable | `api/chatApi.ts:76-113`, `hooks/useChat.ts:83-89`, `components/ErrorBanner.tsx:6-12` | `chatApi.test.ts:112-162`, `useChat.test.tsx:148-177`, `App.test.tsx:84-108` | PASS |
| FR-08 single base-URL constant + Vite dev proxy, no secrets | `api/chatApi.ts:5-6`, `vite.config.ts:7-14`; secrets grep 0 | `chatApi.test.ts:42-63` | PASS* (no-CORS browser check: M-06) |
| FR-09 `POST /chat` validation before any LLM call, 400 texts, pre-stream 503 | `chat/ChatRequestValidator.kt:17-48`, `plugins/ChatRouting.kt:101-124` | `ChatRequestValidatorTest` (12), `ChatRoutesTest.kt:148-218` (5 texts, JSON content type, 0 agent calls, no provider/tool line) | PASS |
| FR-10 chunk → one terminal frame, `done.answer` = concatenation, error frame + close | `plugins/ChatRouting.kt:69,76-83,127-154,171-179` | `ChatRoutesTest.kt:73-111,221-280`, `ChatChainIntegrationTest.kt:331-337` | PASS* (curl -N flush: M-06.1) |
| FR-11 one unified agent with both tools; tool resources untouched | `chat/KoogChatAgent.kt:19-30,58-115`, `Application.kt:250-264` | `ChatModulesTest.kt:49-69` (chat registry = both tools, untagged/fueling single-tool, same singletons), `ChatChainIntegrationTest.kt:262-267,313-315`; tools/resources byte-unchanged | PASS |
| FR-12 history replayed as one turn per message, system prompt backend-owned | `chat/KoogChatAgent.kt:69-77`, `chat/ChatRequestValidator.kt:36-41` | `KoogChatAgentTest.kt:135-155`, `ChatChainIntegrationTest.kt:276-277` (`messages=[system, user, assistant, user]`) | PASS |
| FR-13 provider selection reuses `LlmTarget`/context/routing executor | `plugins/ChatRouting.kt:111-124,130`, `llm/ProviderRoutingPromptExecutor.kt:66-79` | `ProviderRoutingPromptExecutorTest.kt` (2 new, collection-time routing + blank key), `ChatRoutesTest.kt:114-145,185-218` | PASS |
| FR-14 one `req=` chain: inbound → provider rounds → tool/db → outbound, no secrets | `plugins/ChatRouting.kt:103,130,171-179`, `log/LoggingPromptExecutor.kt:57-74`, `chat/KoogChatAgent.kt:88-91` | `ChatChainIntegrationTest.kt:254-299` (stage order, one id, `tools_count=2`, `streaming=true`, key fixture absent from log and frames); `ChatRoutesTest.kt` per-case outbound | PASS* (live grep: M-06.2) |
| FR-15 additive slice; frozen contracts and tests preserved | `plugins/Routing.kt:77` (one call), `Application.kt:193,260-264,289`; `git status` shows no tool/resource/`build.gradle.kts`/`application.conf` change | `./gradlew cleanTest test` → BUILD SUCCESSFUL, 299 tests / 41 classes, 0 failures (250 pre-existing @Test methods at HEAD, 32 of 34 pre-existing classes byte-unchanged) | PASS |
| FR-16…FR-20 E2E-1…E2E-4, E2E-6 | as FR-05/07/10/11/12 above | offline proxies in `ChatChainIntegrationTest`, `chatApi.test.ts`, `useChat.test.tsx`, `App.test.tsx` | PASS* (live walkthrough = M-06.1…M-06.6, orchestrator) |
| FR-21 pipeline artifacts, record, reviews | `01/02/03/spec.md` + `04-test-report.md` + **`06-implementation-record.md`** (probe result §1, deviations §2, D-11 accounting §2.3, T-01…T-20 mapping §3, verification verdicts §4, review-run pointer §5) | record read and cross-checked against the diff; tester report T-01/T-19 now PASS with the gap marked RESOLVED | PASS |
| FR-22 docs: backend `/chat` section + frontend README | backend `README.md` `/chat` (contract, frames, 400/503, `curl -N`, trace, Postman note; one row added to the endpoint table — recorded deviation 2.1.6); frontend `README.md` (install/dev/build/typecheck/test/preview/lint, proxy, `VITE_API_BASE_URL`, E2E-1 walkthrough) | read-through: no contradicting contract found; reproduction itself is M-06 | PASS* |
| NFR-01 offline frontend tests covering the NFR minimum | tests co-located with sources | `npm run test` exits 0 with no backend/network, 8 files / 59 tests; persistence+restore, full history body, per-chunk append, error with preserved history all covered | PASS |
| NFR-02 offline backend tests, 250 pre-existing green, no weakened contract | `ChatRequestValidatorTest`…`ChatChainIntegrationTest`, `LogCapture`, scripted executors | 299/299 green offline; exactly two pre-existing test files touched, one pre-existing assertion changed (recorded D-11: 1 line → 2, frames assertion kept) | PASS |
| NFR-03 0 secrets; key never in a frame or log line | `llm/ProviderAvailability.kt:12-23` (boolean only), no config object into `TraceLog` | `ProviderAvailabilityTest` (no key material), `ChatChainIntegrationTest.kt:259-260` (key fixture absent from log and frames); frontend secrets grep = 0; only `ai-turbo-chat-history` written | PASS |
| NFR-04 stacks unchanged; no new dependency | no diff in `build.gradle.kts`/`application.conf`; `ktor-server-sse` not added; frontend runtime deps react/react-dom | `npm run build`/`typecheck` exit 0; backend gate green | PASS |
| NFR-05 performance: indicator, per-chunk render, progressive frames, no hang | `useChat.ts:65-67` (synchronous `isStreaming`), `components/MessageBubble.tsx:19-24`, `plugins/ChatRouting.kt:160-163` (flush per frame) | `useChat.test.tsx:61-87` (no batching), `ChatChainIntegrationTest.kt:331` (3 chunks before terminal); 200 ms/100 ms wall-clock and `curl -N` granularity are M-06 | PASS* |
| NFR-06 observability: one chain, ordered stages, `streaming=true`, truncation, 0 secrets | as FR-14 | as FR-14 | PASS* |
| NFR-07 current Chrome/Safari: fetch streaming, `localStorage` | `chatApi.ts:88-111` (`getReader`+`TextDecoder({stream:true})`), `hooks/chatStorage.ts` | jsdom-level only; browser matrix is manual | PASS* (M-06) |
| NFR-08 harness discipline: verdict-only output, grep-only logs, no secrets, no commits | reports, the record and this review read verdicts only; no commit/push made | `git status` in the backend shows uncommitted work only; no server was started by the tester or by either review pass | PASS |

## Findings

### Blocker

None.

### Major

**M-1 (resolved, re-verified) — the implementation record required by FR-21/T-01/T-10/T-19 and the
feature DoD is now on disk.**
Location: `docs/features/react-chat-web/06-implementation-record.md`.
Resolution: the record covers every item the finding asked for — the T-01 probe result with the
verified Koog 1.2.0 signatures and the D-04 fact (§1), the backend and frontend deviations with
their evidence basis (§2), the D-11 frozen-test exception and accounting (§2.3), the T-01…T-20
status/evidence mapping (§3), verdict-only verification results and the resolved dev-dependency
versions (§4) and the review-run pointer to this file (§5). The tester's report was updated in step
(T-01 and T-19 PASS, gap marked RESOLVED). I re-read the record and verified its two new load-bearing
claims against the resolved jars: the `ResolvedModel` streaming default delegates to
`model.effectiveModel` on the same instance (so no mirror override is needed for the D-11 line on
the DeepSeek path), and the malformed-body `400` text is inherited byte-identically from the frozen
`/weather` handling (`ChatRoutesTest` asserts equality for the same body). No code changed in this
resolution. No open action.

### Minor

**m-1 — A failure raised while collecting the stream is logged as a provider failure.**
Location: `/Users/murkka/Work/ai-project/src/main/kotlin/com/aiturbo/log/LoggingPromptExecutor.kt:65-72`.
Rationale: the `catch (e: Throwable)` wraps `emitAll(...)`, so a throwable thrown by the *consumer*
(a failing SSE write in `plugins/ChatRouting.kt:131-134`, or the agent's `emit`) is caught and
logged via `TraceLog.deepseekFailure` as `stage=deepseek-response … error=…` — the trace then blames
the provider for a client-write/downstream failure. It cannot lose data (the exception is rethrown,
`outbound`/response lines are skipped consistently), but the `error=` text can be misleading in
exactly the case an operator would grep for. The same family covers
`plugins/ChatRouting.kt:139-146`, where a failed chunk write is caught and answered with a further
write attempt on a dead connection.
Suggested fix: narrow the failure attribution — collect the delegate flow inside the `try` and log
`deepseekFailure` only for failures of the provider call (or mark the line
`error_source=consumer`), and skip the terminal frame when the failure came from writing.
Non-blocking polish, already recorded.

### Nit

**n-1 — `streamChat` abandons the reader on the terminal `done` frame.**
Location: `/Users/murkka/Work/ai-turbo-web/src/api/chatApi.ts:101-102`.
Rationale: `return` on `done` leaves the `ReadableStream` reader un-released instead of cancelling
it; harmless today (the server closes right after `done`) but keeps the connection handle until the
response ends.
Suggested fix: `await reader.cancel().catch(() => {})` (or `reader.releaseLock()`) before returning.

**n-2 — `.gitignore` does not cover `.env`.**
Location: `/Users/murkka/Work/ai-turbo-web/.gitignore:13` (`*.local` only).
Rationale: NFR-03/FR-08 hold today (no `.env`, nothing secret read), but the frontend project is
about to become a git repository and a future `.env` would be untracked-but-visible.
Suggested fix: add `.env` / `.env.*` (keeping `!.env.example` if one is ever added).

**n-3 — The whole history is re-serialised to `localStorage` on every chunk.**
Location: `/Users/murkka/Work/ai-turbo-web/src/hooks/useChat.ts:38-41` with `:74-79`.
Rationale: one `JSON.stringify` + `setItem` per streamed chunk; correct and design-conformant
(the design chose the `useEffect`-on-`messages` persistence), just avoidable churn in a long
conversation.
Suggested fix: keep the effect, debounce the save, or persist on stream completion.

## Scope check

Diff vs plan — everything planned, nothing unrelated:

- Backend, modified (7 files, all in the plan): `Application.kt` (availability binding + `chatModule`
  + import), `plugins/Routing.kt` (one `chatRoutes()` line), `llm/ProviderRoutingPromptExecutor.kt`
  (D-10 override), `log/LoggingPromptExecutor.kt` (D-11 outcome line), `README.md` (T-20), and the
  two test files whose changes the plan records (D-11; `ProviderRoutingPromptExecutorTest` is
  additive-only). New: `chat/{ChatAgent,ChatRequestValidator,KoogChatAgent}.kt`,
  `llm/{ProviderAvailability,StreamedAssistant}.kt`, `plugins/ChatRouting.kt`, and the seven test
  classes listed in the design — all planned. No changes to tools, JSON tool resources,
  `build.gradle.kts`, `application.conf`, or the weather/fueling slices. Diffstat at both review
  passes: 7 files changed, 290 insertions(+), 8 deletions(-).
- Frontend, new project: file inventory matches the design's list; deviations are the recorded ones
  assessed below. `CLAUDE.md`, `CODE_STYLE.md`, `.claude/` untouched; `docs/` holds the feature
  folder (01/02/03/spec, 04-test-report, 05-review, 06-implementation-record). `dist/` and
  `node_modules/` are build/install output and are git-ignored.
- Deviations assessed and accepted as behaviour-preserving, now all recorded in
  `06-implementation-record.md` §2: (1) `ChatTurnDto` instead of `ChatMessageDto` — necessary,
  because the frozen static guard matches the substring `class ChatMessage`
  (`src/test/kotlin/com/aiturbo/RawDeepSeekCallTest.kt:52`), wire shape and KDoc reason intact;
  (2) malformed body answers `400 {"error":"Invalid request"}` (design table said
  "Invalid request body") — inherited Ktor/StatusPages precedence, byte-identical to `/weather` and
  asserted as such by `ChatRoutesTest`; (3) the DeepSeek branch of the routing override passes the
  request-scoped `ResolvedModel` through — observably equal to the design's `model.effectiveModel`
  wording (verified from `PromptExecutorAPI`'s default implementation); (4) no mirror override on
  `LoggingPromptExecutor` — the base default delegates on the same instance, so the D-11 line is
  emitted (same bytecode check); (5) test-only fixtures in the chain test; (6) one row added to the
  backend README endpoint table. Frontend: oxlint instead of the scaffold's ESLint, the
  `scrollIntoView` jsdom stub, the SSE default event name, the defensive client error texts and the
  dependency-version drift (D-14 delegates versions to install time) — all recorded and acceptable.
- No unrelated changes found in either diff.

## Checks run

| Command / check | Observed (verdict only) |
|---|---|
| `cd /Users/murkka/Work/ai-project && ./gradlew cleanTest test` | **BUILD SUCCESSFUL**; `Task :cleanTest` + `Task :test` executed |
| backend test results (`build/test-results/test/*.xml`) | 41 classes, **299 tests, 0 failures, 0 errors, 0 skipped** |
| frozen-test accounting (independent) | `git grep -c @Test HEAD -- src/test` = **250**; working tree = **299**; `git diff --name-only HEAD -- src/test` = only `LoggingPromptExecutorTest.kt` + `ProviderRoutingPromptExecutorTest.kt` |
| `cd /Users/murkka/Work/ai-turbo-web && npm run test` | exit 0 — 8 files, **59 tests passed**, 0 skipped, offline |
| `cd /Users/murkka/Work/ai-turbo-web && npm run typecheck` | exit 0, no diagnostics |
| `cd /Users/murkka/Work/ai-turbo-web && npm run build` | exit 0 |
| `cd /Users/murkka/Work/ai-turbo-web && npm run lint` | exit 0, no findings |
| secrets grep (both projects, sources/config/docs) | 0 matches; only `ProviderAvailability.DEEPSEEK_KEY_MISSING` literal (a message, not a secret) |
| Koog 1.2.0 premise checks (reviewer-side, `javap` on `agents-core-jvm-1.2.0.jar`, `prompt-executor-model-jvm-1.2.0.jar`) | `requestLLM()` appends the assistant reply; `requestLLMStreaming()` does not; the `ResolvedModel` streaming default reduces to `model.effectiveModel` on the same instance — D-04/D-11 and record deviations 2.1.3/2.1.4 hold |
| re-review delta (record resolution) | `06-implementation-record.md` read in full; `04-test-report.md` T-01/T-19 PASS and gap 1 RESOLVED; backend `git status`/diffstat and all frontend source mtimes unchanged since the first pass |

No server, dev server, LLM, Ollama or database was started by either review pass; full build/test
output was not read into context.

## Out of scope

- **M-06 live E2E** (E2E-1…E2E-7): the curl `-N` flush granularity (R-04), SSE through the Vite
  proxy (R-05), real tool data, both providers, reload persistence, the browser matrix (NFR-07) and
  the live trace/secrets grep remain the orchestrator's manual step; nothing in the reviewed diff
  can prove or disprove them, and they are the only remaining gate on the feature DoD.
- **NFR-05(a)(b) wall-clock targets** (200 ms indicator, 100 ms per-chunk render) are devtools
  measurements; only their behavioural proxies are automated.
- **`respondTextWriter`/Ktor-level flush behaviour** is a framework property; the per-frame `flush()`
  call is present (`plugins/ChatRouting.kt:160-163`) but its effect is only observable live.
- **Pre-existing, untouched by this diff:** the frontend project is not a git repository (so
  `reviewer-git` cannot produce a diff there — an observation recorded in the test report, not a
  defect of this feature); `dist/` is present in the working tree but ignored by `.gitignore`.

---

Verdict: **APPROVED** — 0 blockers, 0 majors (M-1 resolved and re-verified), 1 minor, 3 nits; the
remaining findings are non-blocking polish. The only outstanding item is the orchestrator's manual
M-06 live walkthrough.
