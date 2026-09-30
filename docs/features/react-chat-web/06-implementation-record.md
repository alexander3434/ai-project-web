# React Chat Web — Implementation Record

Artifact required by FR-21 and the feature DoD (plan T-01/T-10/T-19, milestones M-01…M-05). It
records the T-01 probe result, the deviations from the plan/design, the per-task completion and the
verification verdicts. Evidence here is verdict-only, per the `CLAUDE.md` discipline; the detailed
test evidence is in `04-test-report.md`, the feature-level review in `05-review.md`.

## 1. T-01 — Koog 1.2.0 API probe (verified signatures)

Compile-probe file `KoogApiProbeTest.kt` was temporary and deleted after recording. Verified against
the resolved Koog 1.2.0 artifacts:

- `AIAgent.builder().id(String).promptExecutor(PromptExecutor).llmModel(LLModel).systemPrompt(String)
  .temperature(Double).maxIterations(Int).toolRegistry(ToolRegistry).functionalStrategy(...).build()`
  → `AIAgent<Input, Output>`; `agent.run(input): Output`.
- `ai.koog.agents.core.agent.functionalStrategy<In, Out>("name") { … }`; inside the strategy:
  `appendPrompt { }`, `requestLLM(String): Message.Assistant`, `llm.writeSession { }`,
  `requestLLMStreaming(): Flow<StreamFrame>`, `executeTools(calls): List<ToolResult>`;
  `PromptBuilder.user/assistant/toolResult/message`.
- `Message.Assistant(parts, metaInfo = ResponseMetaInfo.Empty)`, `MessagePart.Text(text)`,
  `MessagePart.Tool.Call(id, tool, args, cacheControl?)`; `ToolResult.output`, `.isError`,
  `.toMessagePart()`.
- `StreamFrame.TextDelta(text, index?)`, `TextComplete(text, index?)`,
  `ToolCallComplete(id, name, content, index?)`, `ToolCallDelta`, `End()`.
- **D-04 fact confirmed:** `requestLLMStreaming()` does **not** self-append the assistant reply
  (only the tool-result messages appended in the same `writeSession` reach the session), so
  `chat/KoogChatAgent.kt` appends the assembled message by hand
  (`appendPrompt { message(response) }`); asserted in `KoogChatAgentTest` via the third request's
  prompt. (Independently re-verified by the review from `agents-core-jvm-1.2.0.jar`.)
- `javap` check for T-06: the base `PromptExecutorAPI` default for the `ResolvedModel` streaming
  shape reduces to `this.executeStreaming(prompt, resolvedModel.effectiveModel, tools)` on the same
  instance — the basis for deviations 3 and 4 below.

## 2. Deviations from the plan/design

### 2.1 Backend / plan deviations (6)

1. **T-02 naming — `ChatMessageDto` → `ChatTurnDto`** (`plugins/ChatRouting.kt`,
   `chat/ChatRequestValidator.kt`, `ChatRequestValidatorTest.kt`). The frozen static guard
   `RawDeepSeekCallTest` scans production sources for the removed raw client's DTO name prefix
   (`src/test/kotlin/com/aiturbo/RawDeepSeekCallTest.kt:52`, `"class ChatMessage"`); the design's
   name failed the 250 pre-existing tests. The wire shape (`role`/`content`) and the KDoc reason are
   intact; the guard stays green.
2. **T-09 malformed-body 400 text — inherited from the Ktor handler precedence.** A malformed JSON
   body answers `400 {"error":"Invalid request"}`, not the design's `"Invalid request body"`: in Ktor
   3.3.3 `ContentTransformationException extends IOException`, so the pre-existing
   `BadRequestException` StatusPages handler wins over the `ContentTransformationException` handler
   (`plugins/Routing.kt:36-43`). Verified identical for `/weather` (`ChatRoutesTest` sends the same
   bad body to both routes and asserts equal error text) — inherited frozen behaviour, not
   introduced by `/chat`.
3. **T-06 deepseek branch argument — request-scoped `ResolvedModel` passed through.** The additive
   override calls `deepseek.executeStreaming(prompt, model, tools)` with the `ResolvedModel`
   documented in KDoc (D-10); per the `javap` check above the observable behaviour equals the
   design's `model.effectiveModel` wording while preserving provider-side model resolution.
   Covered by `ProviderRoutingPromptExecutorTest` (2 new tests: collection-time routing, blank key).
4. **T-07 — no mirror override needed on `LoggingPromptExecutor`.** The design anticipated a
   `ResolvedModel` parallel override; the base default delegates on the same instance, so the
   streamed outcome line is always emitted (recorded in the class KDoc).
   `log/LoggingPromptExecutor.kt` keeps the `streaming=true` request line and logs the assembled
   `stage=deepseek-response` (or the failure marker) after the stream ends; frames stay unfiltered.
5. **T-10 test-only fixtures.** The chain module binds `FakeStageFuelingRepository` (reused shared
   fixture) so the real `FindFuelingTool` can populate the chat registry's two-tool descriptor set,
   and passes the raw scripted executor as the local delegate (only the DeepSeek branch is
   exercised). Product code unaffected.
6. **T-20 README row.** Besides the new `## Chat (POST /chat)` section, one row was added to the
   existing API endpoint table so the endpoint index stays complete; no other existing README text
   was changed.

### 2.2 Frontend / tooling deviations (5, assessed in `04-test-report.md` / `05-review.md`)

1. Template ships `.oxlintrc.json` (oxlint) instead of `eslint.config.js` — create-vite 9.2.1
   default, dev-only, no requirement mandates ESLint, `npm run lint` clean.
2. `Element.prototype.scrollIntoView` stub in `src/test/setup.ts` — jsdom does not implement
   scrolling; test-only.
3. SSE parser default event name `message` — the backend always labels frames; covered by a test.
4. Two defensive client error texts (`Неожиданный ответ сервера`, `Соединение прервано`, plus
   `FALLBACK_ERROR`) — strengthen, never contradict, FR-07/FR-10.
5. Dependency-version drift — explicitly delegated to install time by D-14 and recorded in
   `package.json`/lockfile (versions in §4).

### 2.3 Defect fix during M-06 (recorded, see §6)

D-18 — the client-disconnect guard in `plugins/ChatRouting.kt` (frame writes fail quietly instead of
surfacing as a provider error / 500). Recorded in §6 with the root cause and evidence.

### 2.4 Frozen-test exception (D-11, recorded)

Exactly two pre-existing test files are touched: `log/LoggingPromptExecutorTest.kt` — one
pre-existing streaming assertion changed (1 line → 2; the frames assertion kept), required by the
manual assistant append of the D-04 fact — and `llm/ProviderRoutingPromptExecutorTest.kt`
(additive-only). Accounting: 250 pre-existing `@Test` methods at HEAD, 249 untouched, all green.

## 3. Task completion (T-01…T-20)

| Task | Status | Evidence |
|---|---|---|
| T-01 | Done | Probe result recorded in §1; probe file deleted |
| T-02 | Done | `chat/ChatAgent.kt`, `chat/ChatRequestValidator.kt`, DTOs in `plugins/ChatRouting.kt`; `ChatRequestValidatorTest` (12) |
| T-03 | Done | `llm/StreamedAssistant.kt`; `StreamedAssistantTest` |
| T-04 | Done | `chat/KoogChatAgent.kt` (+`CHAT_SYSTEM_PROMPT`, fallback); `KoogChatAgentTest` |
| T-05 | Done | `llm/ProviderAvailability.kt`; `ProviderAvailabilityTest` |
| T-06 | Done | `llm/ProviderRoutingPromptExecutor.kt` override; `ProviderRoutingPromptExecutorTest` (2 new) |
| T-07 | Done | `log/LoggingPromptExecutor.kt` outcome line; `LoggingPromptExecutorTest` (D-11) |
| T-08 | Done | `chatModule`/availability bindings in `Application.kt`; `ChatModulesTest` |
| T-09 | Done | `plugins/ChatRouting.kt` route + one call in `plugins/Routing.kt`; `ChatRoutesTest` |
| T-10 | Done | `ChatChainIntegrationTest` (3: frames, 8-stage chain/one `req=`, no-weather round) + full-suite gate |
| T-11 | Done | Frontend scaffold + tooling (`package.json`/lockfile, tsconfigs, `vite.config.ts` proxy, `src/test/setup.ts`) |
| T-12 | Done | `src/types.ts`, `src/api/sse.ts`; `sse.test.ts` (11) |
| T-13 | Done | `src/api/chatApi.ts`; `chatApi.test.ts` (12) |
| T-14 | Done | `src/hooks/chatStorage.ts`; `chatStorage.test.ts` (8) |
| T-15 | Done | `src/hooks/useChat.ts`; `useChat.test.tsx` (10) |
| T-16 | Done | `components/{ChatWindow,MessageList,MessageBubble,ErrorBanner}.tsx`; `MessageList.test.tsx` (7, incl. scroll pinning) |
| T-17 | Done | `components/{ChatInput,ModelSelector}.tsx`; tests (4 + 2) |
| T-18 | Done | `src/App.tsx`, `src/index.css`; `App.test.tsx` (5) |
| T-19 | Done | Offline gate verdicts in §4; dependency/secrets checks clean; reviews per §5 |
| T-20 | Done | Backend `README.md` `/chat` section; frontend `README.md` (commands, proxy, `VITE_API_BASE_URL`, E2E-1 walkthrough) |

## 4. Verification verdicts

- Backend: `./gradlew test` → **BUILD SUCCESSFUL**, 41 suites, **299 tests, 0 failures, 0 errors**
  (250 pre-existing + 49 new/changed-method additions; frozen accounting in §2.4). After the M-06
  defect fix of §6: **BUILD SUCCESSFUL, 303 tests, 0 failures/errors** (+4 guard tests).
- Frontend: `npm run test` → **8 files, 59 tests passed, 0 failed** (offline, backend stopped, no
  network); `npm run typecheck` → exit 0; `npm run build` → exit 0; `npm run lint` → exit 0.
- Secrets: 0 matches in both projects; the frontend writes only `ai-turbo-chat-history`; no new
  backend dependency, no `application.conf` change; nothing committed or pushed.
- Frontend dev-dependency versions (resolved by npm at install time, per D-14): vitest `^5.0.2`,
  jsdom `^30.1.1`, @testing-library/react `^16.3.3`, @testing-library/jest-dom `^7.0.1`,
  @testing-library/user-event `^14.6.7`, @vitejs/plugin-react `^6.1.1`, oxlint `^1.81.0`,
  typescript `~6.0.2`, @types/node `^24.13.3`, @types/react `^19.2.18`, @types/react-dom `^19.2.7`;
  runtime deps: react/react-dom only.
- Live E2E (M-06) was not run by the implementation or the tester; it remains the orchestrator's
  manual step.

## 5. Reviews

The review runs required by FR-21 were executed by the project agents
(`code-style-checker`, `reviewer-correctness`, `reviewer-deduplication`, `reviewer-git`) over the
feature diff; the feature-level review record, findings and verdict are in `05-review.md` (no final
verdict is claimed here).

## 6. Defect fix during M-06 — client-disconnect guard (D-18)

Live M-06 (`model=local`, log `/tmp/chat-e2e.log`, requests `8e050cce` and `3bdae3dd`) ended streamed
turns with `outbound status=500` and `stage=deepseek-response error=KoogHttpClientException: Error
from client: OllamaClient`. Root cause, from both stack traces: the client's response channel was
closed (the client stopped reading; the server configures no write timeout), and the next `chunk`
frame write failed in `ChatRoutingKt.writeFrame` with `io.ktor.utils.io.ClosedWriteChannelException`.
The exception propagated from the frame collector into Koog's channel-backed streaming flow, where
`KtorKoogHttpClient$lines$1` wrapped it — its bytecode exception table is
`KoogHttpClientException` → rethrow, `CancellationException` → rethrow, `Exception` → wrap — into a
provider-blame `deepseek-response error=` line; the route's `catch (Throwable)` then wrote an `error`
frame on the dead channel, that write escaped `respondTextWriter`, and StatusPages answered 500.

Hypothesis B (a Koog/Ollama streaming defect on long generations) is disproven: the failing write is
the chunk frame at `ChatRouting.kt:133` (Ollama had already produced output) and the cause stack ends
in the server response writer, not in the Ollama client. Koog's Ollama converter warning about
`Result(...)` in the same log is benign — `toOllamaChatMessages` adds the tool output as its own
`role="tool"` message (bytecode: `OllamaChatMessageDTO(role = "tool", content = Result.getOutput())`).

Fix (D-18, minimal, no fallback): `writeFrame`/`writeTerminal` became `internal` and return `false`
when the write fails with an `IOException` (`ChannelWriteException`/`ClosedWriteChannelException` are
both `IOException`s), rethrowing `CancellationException` untouched; on `false` the route sets
`clientGone`, ends the collection with a private `ClientGoneException : CancellationException` and
returns without a terminal frame and without an `outbound` line (D-12 semantics preserved; no 500 log
and no provider-blame line). The DeepSeek path is untouched, and no non-streamed fallback was added.

Tests (offline, +4 in `ChatRoutesTest`): a closed channel makes both writers return `false` with no
`outbound` line; a delivered terminal frame is byte-exact and closes the chain with `outbound`
status 200; a `CancellationException` in a write is rethrown; a client that stops reading mid-stream
(the live defect shape) ends the turn with no error frame, no `outbound` and no 500.

### 6.1 Local non-streamed post-tool fallback — investigated, not applied (recorded)

A later M-06 re-run (`/tmp/chat-e2e2.log`, reqs `1f418d69` from 02:47:57 and `e125a915` from
02:48:35, both `model=local`) was read as evidence that the Ollama converter's skipped `Result` part
makes the streamed post-tool round fail server-side, and a local-only fallback to non-streamed
`requestLLM` was requested. The log does not support that reading:

- both turns did send the post-tool round to Ollama (`stage=deepseek-request … streaming=true`,
  `tools_count=2`), and no client/provider exception follows;
- each turn ends with `ERROR a.k.a.core.agent.FunctionalAIAgent - Execution exception reported by
  server!` whose payload is `com.aiturbo.plugins.ClientGoneException: the client closed the response
  channel` — the D-18 guard's own marker, raised only after a `writeFrame` failed with an
  `IOException`; the phrase "reported by server" is Koog's wording for a strategy exception;
- the D-18 fix behaves live as designed: 0 `ChannelWriteException`/`ClosedWriteChannelException` in
  the log, no `deepseek-response error=` provider-blame line, no `outbound` and no 500 for either
  request (`outbound=0` for both);
- timing: `1f418d69` sent its post-tool round 41 s after inbound (round 0 15 s, timezone call 24 s,
  tool 1 s) and hit the guard at 54 s; `e125a915` sent it 10 s after inbound and hit the guard at
  22 s — the clients were already gone in both cases, which matches a client-side timeout, not a
  server rejection.

The converter premise is also weaker than stated: `toOllamaChatMessages` skips a `Tool.Result` only
in the *text* message of the user turn; the same method appends a dedicated
`OllamaChatMessageDTO(role = "tool", content = Result.getOutput())` (bytecode offsets 319-341), so
the tool output is sent.

No fallback was applied: it would not change the observed failure (the client no longer reads the
answer) and it would remove streaming for local answers. If an Ollama-side rejection of the post-tool
round is observed (Ollama log line or HTTP error body), the fallback is a ~10-line change in
`chat/KoogChatAgent.kt` plus a scripted test, and this entry is the place to record it. For M-06 the
local turn needs a client that waits for it (e.g. `curl -N --max-time 300`, or the browser UI); the
`Execution exception reported by server!` ERROR line for a disconnected client is Koog logging the
D-18 marker and is cosmetic (no `outbound`, no 500, no provider-blame line).
