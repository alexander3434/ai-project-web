# Specification: React Chat Web (backend /chat + React frontend)

- **Slug:** react-chat-web
- **Date:** 2026-09-30
- **Team:** feature-design (analyst → architect → planner agents)
- **Status:** ready for implementation

---

# React Chat Web — Requirements

This feature creates the React web frontend for the ai-turbo backend in the new project
`/Users/murkka/Work/ai-turbo-web` and the backend chat slice that serves it: one chat window where the
operator asks about the weather or a fueling order («пролив») by GUID and sees the answer appear live as
the model generates it. The chat keeps a real conversation history (stored in the browser, sent with every
request) so follow-up questions like «а завтра?» work, and the existing tools (`get_weather`,
`find_fueling`) keep working from inside the same conversation. The backend gains one chat endpoint served
by one unified Koog agent holding both tools, while the existing `/weather` and `/fueling` endpoints and
all 250 offline backend tests stay untouched and green. The frontend is React + TypeScript + Vite per the
project's `CODE_STYLE.md`, with streamed answers, a `local`/`deepseek` model selector and error display
that never loses the history. Everything is produced through the `/feature-design` and
`/feature-implementation` pipeline with the project's review agents.

## Context and goals

**Why.** Today the backend is used through Postman: each question is one isolated HTTP request
(`POST /weather`, `POST /fueling`), there is no conversation, and the answer arrives only when the model
has finished generating. The user asked for a web application with a chat that "works properly with
message history", keeps the existing tools, and supports "живое общение" — live, incremental output.
This is the first frontend for the backend: a browser chat that turns isolated requests into one
continuous conversation with visible streaming answers, while the backend keeps every property it has
today (offline tests, trace chain, response contracts).

**Who it is for.** The same person who runs the backend locally today (`./gradlew run`) and sends requests
from Postman: a developer/operator who wants to ask "какая погода в Москве?", follow up with "а завтра?",
and later paste a fueling order GUID into the same conversation — from a browser, with the answer
appearing as it is written.

**Current state — the new frontend project (verified):**

- `/Users/murkka/Work/ai-turbo-web` contains only `CLAUDE.md`, `CODE_STYLE.md` and `.claude/agents/`
  (`code-style-checker`, `reviewer-correctness`, `reviewer-deduplication`, `reviewer-git`). There is no
  `package.json`, no Vite config, no `src/` — the application is scaffolded by this feature.
- `CODE_STYLE.md` fixes the frontend stack and conventions: TypeScript + React + Vite only (no
  Redux/Zustand/jQuery/CSS frameworks), `fetch` (or `EventSource` for SSE), structure `src/api/`,
  `src/components/`, `src/hooks/`, `src/types.ts`, `App.tsx`; history lives in `useChat` with a
  `localStorage` key `ai-turbo-chat-history`; the full session is sent to the backend; streamed tokens are
  appended to the last message and stream errors do not lose the history; the model (`local`/`deepseek`,
  default `deepseek`) is a per-request field; one base URL constant `VITE_API_BASE_URL` (default
  `http://localhost:8080`) with a Vite dev-proxy as the preferred CORS workaround; tests are offline with
  mocked `fetch`/`EventSource`; no keys/passwords in code or `localStorage` (except the chat history).
- `CLAUDE.md`: build/test output is read as a verdict only; backend logs only via grep by `req=`/`stage=`
  in `../ai-project/logs/ai-turbo.log`; specs via `/feature-design`, implementation via
  `/feature-implementation`; no secrets, no commit/push without an explicit request.

**Current state — the existing backend (`/Users/murkka/Work/ai-project`, verified):**

- Kotlin 2.3.10 / Ktor 3.3.3 / Koog 1.2.0 / Kodein 7.32.0 / Exposed 1.5.0 / JVM 17 (`build.gradle.kts`).
- Two Koog tools in `com.aiturbo.tools`: `GetWeatherTool` (`get_weather` — resolves the location, fetches
  Open-Meteo, writes a row into the local `users` table) and `FindFuelingTool` (`find_fueling` — validates
  a GUID, reads the stage database read-only); both take name/description from JSON resources under
  `src/main/resources/tools/`.
- Two separate agents with separate registries and system prompts: `KoogWeatherAgent` (registry:
  `get_weather` only) and `KoogFuelingAgent` (registry: `find_fueling` only); both run the same functional
  strategy (non-streaming, ≤ 3 tool rounds, temperature 0).
- Routes: `POST /weather`, `GET /weather/history`, `POST /fueling`, `GET /time`, `GET /`; request bodies
  `{message, model}`; `LlmTarget.fromRequest` maps `model` (absent/blank → `deepseek`, `local`/`deepseek`
  case-insensitive, anything else → `400`); routing happens in `ProviderRoutingPromptExecutor`
  (`llm/ProviderRoutingPromptExecutor.kt`, request-scoped `LlmTargetContext`); every provider call goes
  through a `LoggingPromptExecutor` decorator; a blank DeepSeek key yields `503`.
- Streaming exists only as plumbing: `PromptExecutor.executeStreaming` is implemented in both the routing
  executor and the logging decorator (the `stage=deepseek-request` line already supports
  `streaming=true`), but no production flow uses it today.
- Trace chain: one `req=` correlation id per request; stages `inbound`, `deepseek-request`,
  `deepseek-response`, `tool`, `db`, `outbound` on logger `com.aiturbo.trace`
  (`log/TraceLog.kt`, `plugins/RequestTracing.kt`); bodies truncated at 4096 chars; no secrets.
- Serialization config `ignoreUnknownKeys = true`; DI in Kodein (`appModules` + additive `fuelingModule`
  with string tags); **250 `@Test` methods across 34 test classes, all offline** (fakes, `MockEngine`,
  `LogCapture`); the README documents every endpoint, the trace chain and the stage-verified GUID
  `61574131-999F-48C9-93AE-3EAA68562177`.

**Goals (what success looks like).**

1. The operator opens the web app in a browser, types a question and sees the answer grow in the message
   bubble while it is generated — no waiting for a finished block of text.
2. Weather and fueling questions work from the same conversation: asking about the weather fires
   `get_weather`, asking about an order GUID fires `find_fueling`, and the answers are built from the tool
   results (no invented data).
3. The conversation has real history: a follow-up question that refers to a previous answer works without
   repeating the context, and the history survives a page reload.
4. Both providers are selectable per request (`local`/`deepseek`, default `deepseek`); failures are shown
   in the chat and never wipe the history.
5. The backend does not regress: the existing endpoints and their trace chain are unchanged and all 250
   offline tests stay green; the new chat flow is covered by the same offline-test discipline on both
   sides.
6. The feature is produced through `/feature-design`/`/feature-implementation` with the project harness
   and review agents in both projects.

## Functional requirements

| ID | Requirement | Priority | Acceptance criterion (sketch) |
|---|---|---|---|
| FR-01 | The frontend application shall be created in `/Users/murkka/Work/ai-turbo-web` per its `CLAUDE.md`/`CODE_STYLE.md`: TypeScript + React + Vite, plain CSS, structure `src/api/`, `src/components/`, `src/hooks/`, `src/types.ts`, `App.tsx`; `npm run build` (and `npm run typecheck` once defined) shall succeed from the project root. | Must | Running the build/typecheck commands produces a success verdict; the dependency list contains no state-management, CSS-framework or HTTP-client library; no `any` without a narrowing justification in the diff (code-style-checker). |
| FR-02 | The UI shall provide a chat: a scrollable message list with visually distinct user and assistant messages, a text input and a send action; pressing send immediately renders the user's message and starts the assistant turn; the list follows the newest content. | Must | Manual: typing a message and sending renders a user bubble at once; the assistant bubble appears in place and the list auto-scrolls; sending is possible with the send button and with Enter; an empty/whitespace input cannot be sent. |
| FR-03 | The conversation history shall persist in the browser under the `localStorage` key `ai-turbo-chat-history` and be restored on page load in the original order; missing, empty or corrupted storage shall not break the app (it starts with an empty conversation or ignores invalid entries). | Must | Send ≥ 2 turns, reload the page: the same messages render in the same order; deleting the key or writing invalid JSON starts the app empty without an error; the stored payload contains no secrets other than the conversation. |
| FR-04 | Every chat request shall carry the full session history as an ordered list of messages (`role`, `content`) ending with the message just sent; locally stored extra fields (e.g. a timestamp) shall be stripped or tolerated, never required by the backend. | Must | Inspecting the request body of the 3rd message shows all 3 turns in order; a follow-up sent after a weather answer carries the previous user and assistant turns and the new user turn. |
| FR-05 | The assistant's answer shall be rendered as it is generated: received content chunks append to the in-progress assistant message, and while the request is in flight (including tool rounds) the UI shows a visible activity indicator; no page reload or re-navigation is used. | Must | E2E-1/E2E-5: the bubble grows in ≥ 3 visible steps before completion and the indicator appears immediately after send; if the design records the non-streaming fallback (ASM-04), this criterion is replaced by "the complete answer appears at once and an activity indicator was visible during generation", and the deviation is recorded. |
| FR-06 | The UI shall offer a model selector with the values `local` and `deepseek`, defaulting to `deepseek`, and send the selection in the `model` field of each chat request. | Must | Selecting `local` and sending shows `"model":"local"` in the request body and the Ollama endpoint/model in the backend trace; after a reload the selector is back to the default `deepseek` (persistence is optional, see OQ-10). |
| FR-07 | Failures shall be shown in the chat as a distinct error message (not as an assistant answer): request validation errors, provider unavailability (JSON `400`/`503`), network failures and interrupted/errored streams; the conversation history shall be preserved and the app shall remain usable for the next message. | Must | With the backend stopped, sending shows an error message and no fake answer; the previously exchanged messages are still visible and survive a reload; after restarting the backend the next send succeeds; a `503` response (DeepSeek key absent) is displayed as an error, not as an empty answer. |
| FR-08 | The backend address shall be a single configuration constant (`VITE_API_BASE_URL`, default `http://localhost:8080`), and the development setup shall use the Vite dev-proxy so that no backend CORS change is required; no API key, password or token shall exist in the frontend code or storage (except the chat history). | Must | With the backend running, a chat request from the dev server succeeds with no CORS error in the browser console; a grep of the frontend project finds no key/password; `localStorage` holds only the chat history key. |
| FR-09 | The backend shall expose a chat endpoint accepting `{"messages":[{"role","content"}, …], "model"?}`; it shall validate before any LLM call: a non-empty message list, roles limited to `user`/`assistant`, non-blank content, the last message from the user, and the same `model` rules as the existing endpoints (absent/blank → `deepseek`, `local`/`deepseek`, anything else → `400`); violations return `400 {"error":…}` with no LLM or tool call. | Must | curl cases: a valid body streams an answer; empty `messages`, unknown role, blank content, last message not from the user and unknown `model` each return `400` with no `deepseek-request`/`tool` lines in the log; a blank DeepSeek key with `model=deepseek` yields `503` before any LLM call. |
| FR-10 | The answer shall be streamed: the response is an event stream whose content events carry successive pieces of the answer, followed by exactly one terminal event carrying the complete final answer; the stream always terminates, and a failure after the stream opened is delivered as an error event followed by stream close (never a silent hang). | Must | curl shows the proposed frames in order (see the contract below); the terminal `answer` equals the concatenation of the content chunks; a provider failure produces an error event and the connection closes; the pre-stream `400`/`503` bodies remain JSON (no partial event stream). |
| FR-11 | One unified chat agent shall serve the endpoint: a Koog agent whose tool registry contains both existing tools (`get_weather` and `find_fueling`) with a combined system prompt that preserves both tools' rules (weather questions always call `get_weather`; questions with a GUID always call `find_fueling`; without a GUID the agent asks for it; answers only from tool results, in the user's language, without tool names or JSON); tool implementations, names, descriptions and side effects stay unchanged. | Must | In one conversation, "Какая сейчас погода в Москве?" writes `stage=tool tool=get_weather` and a GUID question writes `stage=tool tool=find_fueling`; never an answer invented without a tool call for those question types; the JSON tool resources are byte-identical to today. |
| FR-12 | The backend shall map the received message list onto the model conversation (one turn per message, original order, system prompt backend-owned) so that follow-up questions that refer to earlier answers work without the user repeating context. | Must | Ask "Какая сейчас погода в Москве?", then "А завтра?" in the same conversation: the second request's `deepseek-request` line contains the earlier turns, the second answer refers to Moscow, and `get_weather` fires again with Moscow. |
| FR-13 | Provider selection for the chat shall reuse the existing mechanism: the same `model` field, the same `LlmTarget` mapping and request-scoped context, the same routing executor; the serving provider is observable in the trace and never in the answer text. | Must | `model=local` produces trace lines with the Ollama endpoint and `qwen3:8b` and no DeepSeek line; `model=deepseek`/absent produces DeepSeek lines; the existing `LlmTargetTest` expectations still hold. |
| FR-14 | Every chat request shall produce the established trace chain on logger `com.aiturbo.trace` under one `req=` id: `inbound` → the provider request/response lines (with `streaming=true` where applicable) → `tool`/`db` lines for tool rounds → an `outbound` entry with the terminal status and a rendering of the final answer; bodies truncated as today; no secret in any line. | Must | One chat request shows the ordered chain in `logs/ai-turbo.log` under one `req=`; a weather question through the chat shows `inbound`, `deepseek-request`, `deepseek-response`, `db`, `tool`, the follow-up provider round-trip and `outbound`; grep finds no key/password in the captured lines. |
| FR-15 | The chat slice shall be additive: `GET /`, `GET /time`, `POST /weather`, `GET /weather/history`, `POST /fueling` keep their contracts, status codes and trace shapes; the tools stay in `com.aiturbo.tools`; the weather slice keeps its `get_weather`-only registry and the fueling slice its `find_fueling`-only registry; the existing test suite stays green. | Must | `./gradlew test` is `BUILD SUCCESSFUL` with all previously existing tests green; the documented Postman/curl examples for `/weather`, `/fueling`, `/time` return the documented statuses and bodies; the logged `/weather` and `/fueling` chains keep their line shapes and single-tool `tools_count=1`. |
| FR-16 | E2E-1: a weather question asked in the running UI (or by curl against the backend) shall fire `get_weather`, stream the answer, and answer with real data from the tool result. | Must | Open the app, ask "Какая сейчас погода в Москве?" → the log shows a `get_weather` tool round, the bubble fills incrementally, and the final text matches the tool data (temperature/description/time zone). |
| FR-17 | E2E-2: a follow-up question that references the previous answer shall work from the conversation history, without the user repeating the context. | Must | Immediately after E2E-1, ask "А завтра?" (or "А какой там часовой пояс?") → the answer uses Moscow from the earlier turn and the second `get_weather` call carries the location; no re-asking from the user. |
| FR-18 | E2E-3: a fueling question with a GUID asked in the same conversation shall fire `find_fueling` and answer with the stage-data summary. | Must | In the same chat, ask for order `61574131-999F-48C9-93AE-3EAA68562177` (the stage-verified GUID from the backend README) → the log shows a `find_fueling` round with `stage=db lookup=found`, and the answer reflects the stage row. |
| FR-19 | E2E-4: the same chat shall work with `model=local` (Ollama running, `qwen3:8b`) and with `model=deepseek`, selected per request. | Must | Both providers answer the same weather question; the trace identifies the serving provider; with Ollama down, `model=local` shows a clear error in the chat and the history survives (FR-07). |
| FR-20 | E2E-6: the conversation shall survive a page reload and be continuable afterwards. | Must | Reload the browser after E2E-1…E2E-3: all messages are restored in order from `localStorage`, and the next question is answered with that restored history in the request body. |
| FR-21 | The feature shall be produced through the pipeline and the existing harness: requirements → design → plan under `/Users/murkka/Work/ai-turbo-web/docs/features/react-chat-web/`, implementation via `/feature-implementation` strictly by the plan, reviews via the project agents (`code-style-checker`, `reviewer-correctness`, `reviewer-deduplication`, `reviewer-git`), with the `CLAUDE.md` discipline of both projects (verdict-only build/test output, backend logs only via `req=`/`stage=` grep, no secrets, no commit/push without an explicit request). | Must | `01-requirements.md`, `02-design.md`, `03-plan.md`, `spec.md` exist and are consistent; the implementation record references the plan tasks and the review runs; build/test evidence in the record is a verdict only. |
| FR-22 | The documentation shall be updated: the backend README documents the chat endpoint with a curl example and the stream frames; the frontend project gains a README with install/run/build commands. | Should | A reader can reproduce E2E-1 from the READMEs alone; no documented contract contradicts the shipped behavior. |

### Chat contract — proposed defaults (the design refines; any override is a recorded decision)

**Request (ASM-01, ASM-06):**

```
POST /chat
Content-Type: application/json
Accept: text/event-stream

{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"deepseek"}
```

- `messages` — required, ordered oldest → newest; roles `user`/`assistant`; non-blank `content`; the last
  message must be from the user. The client sends the full session history (FR-04).
- `model` — optional; same values, default and validation as `POST /weather`/`POST /fueling`
  (absent/blank → `deepseek`; `local`/`deepseek` case-insensitive; anything else → `400`).
- Unknown extra fields are tolerated (the server already serializes with `ignoreUnknownKeys = true`) and
  the client strips its local-only fields when sending.

**Pre-stream failures stay JSON** (the client distinguishes by `Content-Type`): `400 {"error":…}` for
validation (FR-09), `503 {"error":…}` when the selected provider is not configured/available before the
stream opens. No SSE frames are sent for these.

**Stream frames (proposal, ASM-03):**

```
event: chunk
data: {"text":"Сейчас "}

event: chunk
data: {"text":"в Москве "}

event: done
data: {"answer":"Сейчас в Москве +15.4°C, облачно…","model":"deepseek"}
```

```
event: error
data: {"status":503,"error":"LLM provider is unavailable"}
```

- Semantics: zero or more `chunk` frames (append `text` in order), then exactly one terminal frame —
  `done` or `error` — then the stream closes. `done.answer` equals the concatenation of all `chunk.text`
  values. An `error` may arrive at any point after the stream opened; the client shows it in the chat and
  keeps the history.
- The design may refine names/payload fields (e.g. add a progress/status frame for tool rounds or a model
  field on `chunk`), but the chunk → terminal ordering, the completeness property of `done.answer` and the
  error semantics must hold, and every change is recorded.
- **Non-streaming fallback (only if the design proves streaming unusable, ASM-04):** the same endpoint
  answers `200 application/json {"answer":"…"}` in the style of the existing endpoints, and the client
  renders the complete answer at once (activity indicator during generation). The design must record the
  reason; this deviates from the user's explicit "живое общение" requirement and must be surfaced to the
  user as a blocker before implementation.

**Used from the browser:** a `POST` endpoint cannot be consumed with the native `EventSource` (GET-only);
the client reads the stream with `fetch` + `ReadableStream` and parses the `event:`/`data:` frames — the
frontend `CODE_STYLE.md` allows exactly this ("`fetch` (или `EventSource` для SSE-стриминга)").

### End-to-end acceptance criteria (walkthrough)

Prerequisites: the backend runs on `http://localhost:8080` (`./gradlew run`, `DEEPSEEK_API_KEY` in the
git-ignored `.env`), the frontend dev server runs (`npm run dev` in `ai-turbo-web`), the local DB container
is up for `get_weather` writes, and the stage DB is reachable for the fueling case. Observation aids: the
UI itself plus the backend chain via `grep 'req=' ../ai-project/logs/ai-turbo.log`.

1. **Weather + streaming (E2E-1, E2E-5).** Ask "Какая сейчас погода в Москве?". The assistant bubble
   appears with an activity indicator within ~200 ms, then the text grows in ≥ 3 visible steps; the log
   shows `stage=tool tool=get_weather` and a `stage=db saved=…` line; the final text matches the tool
   result.
2. **Follow-up (E2E-2).** Without reloading, ask "А завтра?" The request body carries both earlier turns
   and the new one; the log shows a second `get_weather` call with Moscow and the answer keeps the
   context.
3. **Fueling in the same chat (E2E-3).** Ask "Найди данные по проливу для заказа
   61574131-999F-48C9-93AE-3EAA68562177". The log shows `stage=tool tool=find_fueling` and
   `stage=db lookup=found …`; the answer summarises the stage row in plain language.
4. **Both providers (E2E-4).** Repeat the weather question with the selector on `local` (Ollama up) and on
   `deepseek`: both stream; the trace shows the respective endpoint/model. As a negative check, stop Ollama
   and send with `local`: an error appears in the chat, the history is intact.
5. **Visible live-ness (E2E-5).** While the answer streams, the text is observably appended in separate
   steps (screen recording or devtools network/event timing); the final text equals the terminal frame's
   `answer`.
6. **Reload persistence (E2E-6).** Reload the page: the whole conversation is restored in order from
   `localStorage` (`ai-turbo-chat-history`), and the next question works with that history.
7. **Backend green (E2E-7).** `./gradlew test` → `BUILD SUCCESSFUL` with all previously existing tests
   green; the README Postman/curl examples for `/weather` and `/fueling` still return the documented
   results.

curl equivalent for steps 1–3 (streaming visible with `curl -N`):

```bash
curl -N -X POST http://localhost:8080/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"local"}'
```

## Non-functional requirements

| ID | Category | Measurable target |
|---|---|---|
| NFR-01 | Testability / offline (frontend) | The frontend automated tests run with no backend, no network and no live LLM (`fetch`/`EventSource` mocked) and at least cover: history persistence and restore, the full history in the request body, incremental append of streamed chunks, error display with preserved history. The test command exits successfully on a machine with the backend stopped. Test tooling is chosen by the design (ASM-08). |
| NFR-02 | Testability / offline (backend) | `./gradlew test` is `BUILD SUCCESSFUL` with no network, database or live LLM; the 250 pre-existing tests remain green; new chat coverage uses fakes/scripted executors/`MockEngine`; any modification of an existing test is justified in the design/implementation record and does not weaken a documented behavior contract. |
| NFR-03 | Security | 0 secrets in the frontend project (code, config, `localStorage` — the chat history excepted); backend secrets remain only in the git-ignored `.env`; 0 occurrences of the DeepSeek key or a database password in any log line, HTTP body or SSE frame; a secrets grep over both projects' tracked files and the captured chat log finds 0 matches. |
| NFR-04 | Compatibility / behavior preservation | Existing contracts unchanged: `GET /` 200; `GET /time` 200/400/404; `POST /weather` 200/400/503; `GET /weather/history` 200/400; `POST /fueling` 200/400/503. Backend stack unchanged (Kotlin 2.3.10 / Ktor 3.3.3 / Koog 1.2.0 / Kodein 7.32.0 / Exposed 1.5.0 / JVM 17); frontend stack per `CODE_STYLE.md`. New dependencies only where strictly needed and recorded (ASM-12). |
| NFR-05 | Performance (streaming) | (a) The activity indicator becomes visible within 200 ms of send. (b) Each received chunk is rendered within 100 ms of its arrival (measured in devtools; no batching that delays visible output). (c) The backend streams progressively: with a scripted/slow fake, at least 2 content frames reach the client at distinct times before the terminal frame (and a manual `curl -N` shows the same). (d) No request hangs: an unreachable provider fails within ~15 s (existing connect timeouts), a stalled generation ends through the documented provider timeouts (`OLLAMA_TIMEOUT_SECONDS=120`; DeepSeek client timeout) with an error event or JSON `503`, never an open connection. |
| NFR-06 | Observability | For each chat request the log contains exactly one `req=` chain with `stage=inbound`, the provider `deepseek-request`/`deepseek-response` lines (`streaming=true` for streamed calls), `tool`/`db` lines for tool rounds and one `outbound` with the terminal status; body-like fields truncated at 4096 chars as today; 0 secrets. Verify by grep on `logs/ai-turbo.log`. |
| NFR-07 | Compatibility (browser) | The UI works in the current Chrome and Safari releases on macOS (the development machine), including `fetch` streaming and `localStorage`; no browser extension or plugin is required. |
| NFR-08 | Process / harness discipline | Build and test output is consumed as a verdict (first 20–40 error lines at most); backend logs are read only via `req=`/`stage=` grep; no full build/dev-server output is copied into specs, plans or reports; reviews use the four project agents in both repositories; no commit or push happens without an explicit user request. Verify by inspecting the produced artifacts. |

## Out of scope

- **Authentication, accounts, multi-user support.** Not requested; the app is a local single-operator tool
  against a locally running backend.
- **Backend session/conversation storage.** History is client-side by default (ASM-02); no server-side
  conversations, users or sessions.
- **Multiple conversations / conversation list / export / import.** One conversation per browser profile;
  not requested (ASM-09).
- **Database schema changes or new queries.** The chat adds no storage of its own (ASM-13); the only DB
  writes remain the existing `get_weather` side effect, and the fueling path stays read-only.
- **Changes to the existing tools or their endpoints.** `get_weather`, `find_fueling`, the JSON tool
  resources, `/weather`, `/fueling`, `/time` and their trace shapes stay as they are (FR-15); no new tools
  or data sources.
- **Mobile applications or mobile-first layout.** A web app for a desktop browser is the target.
- **Rich content rendering** (markdown, code blocks, syntax highlighting, images, file attachments, voice
  input) and message editing/deletion/regeneration/branching. The answers are plain-language text; none of
  this was requested.
- **Automatic retries of failed generations.** A failed turn is shown as an error and can be resent
  manually (ASM-11).
- **Production hosting/deployment of the frontend and split-origin CORS configuration.** The Vite
  dev-proxy is the v1 path (ASM-07); deployment is a separate decision if it is ever needed.
- **Model/answer metadata in the UI** (token counts, cost, latency, provider badges). Not requested; the
  serving provider is observable in the trace.
- **Frontend state-management or CSS frameworks, HTTP client libraries, secrets in the frontend.** Forbidden
  by `CODE_STYLE.md` (NFR-03, NFR-04).
- **Internationalization framework / language switch.** The UI is Russian by default (ASM-10).

## Open questions

Defaults below are assumptions for the pipeline to proceed; the design may override any of them only with
an explicit recorded decision (and, for risky ones, a note to the user).

| ID | Question | Why it matters | Default assumption (ASM-xx) |
|---|---|---|---|
| OQ-01 | Which backend shape serves the chat: one new unified endpoint, or reusing `POST /weather`/`POST /fueling` with a router (client-side or in the backend)? | Decides the contract the frontend calls, the agent topology, and which registries change; reusing the existing endpoints would either need request-routing heuristics or a mixed agent on a frozen endpoint/registry, risking the existing tests. | **ASM-01 (default, design may override with a recorded decision):** one new `POST /chat` served by one unified Koog agent whose registry holds both `get_weather` and `find_fueling` with a combined system prompt — a third, additive slice; `/weather` and `/fueling` stay untouched. |
| OQ-02 | Where does the conversation history live: browser storage or a backend session store? | Decides the request contract (full history per request vs a session id) and whether the backend needs state; the user asked for history that works, not for accounts. | **ASM-02:** frontend `localStorage` key `ai-turbo-chat-history` (`CODE_STYLE.md`); the full history is sent with every request; no backend session store. |
| OQ-03 | Which transport carries the answer: SSE or a plain JSON response? | The user's "живое общение" is only honest with incremental delivery; the transport decides the client parser, the backend dependency surface and the error contract. | **ASM-03:** SSE as proposed in the contract section (`chunk` → terminal `done`/`error`); the design may refine frame names/fields while preserving the semantics, and records any change. |
| OQ-04 | Can Koog 1.2.0 stream the final answer of the tool-loop agent (`executeStreaming` at the agent level)? | Verified plumbing exists at the executor layer (`ProviderRoutingPromptExecutor.executeStreaming`, `LoggingPromptExecutor` with `streaming=true` logging), but no production flow uses it and agent-level streaming across tool rounds is unverified — this is the feature's riskiest point. | **ASM-04 (risky):** agent-level streaming is achievable (directly or by composing the run with `executeStreaming`). If the design proves it unusable, the non-streaming JSON fallback is taken **and recorded**, and the deviation from the user's "живое общение" requirement is raised to the user as a decision before implementation (see OQ-03/contract section). |
| OQ-05 | What exactly reaches the model as history, and is the payload bounded? | The backend must not accept client-sent system instructions; long sessions could exceed model context limits, and a silent cap changes follow-up behavior. | **ASM-05:** all session messages, in order, mapped to `user`/`assistant` turns; the system prompt is backend-owned and a client-sent `system` role is rejected; no truncation in v1 — if the design caps the payload, the cap and its user-visible effect are recorded. |
| OQ-06 | What are the exact validation rules for `POST /chat`? | Defines the 400 contract the frontend must handle; must mirror the existing endpoints' style. | **ASM-06:** `messages` required and non-empty; roles `user`/`assistant`; `content` non-blank; last message from the user; `model` rules identical to `/weather`; violations → `400 {"error":…}` before any LLM call; unknown extra fields tolerated (`ignoreUnknownKeys = true`). |
| OQ-07 | Is any CORS configuration needed? | The frontend and backend run on different ports in development; the wrong choice either breaks the browser or modifies the backend unnecessarily. | **ASM-07:** development uses the Vite dev-proxy to `http://localhost:8080` (no Ktor CORS plugin); production/split-origin deployment is out of scope for v1; if the design serves the built app from another origin, enabling CORS becomes an explicit recorded decision. |
| OQ-08 | Which frontend test tooling, and what is the minimum coverage? | The frontend project has no test setup yet; `CODE_STYLE.md` requires offline tests with mocked `fetch`/`EventSource`. | **ASM-08:** a Vite-native offline setup chosen by the design (e.g. Vitest + React Testing Library); coverage at least the NFR-01 scenarios; the choice and its dependency additions are recorded (ASM-12). |
| OQ-09 | One conversation or many; is there a "clear history" action? | Affects storage shape and UI surface; the request asked for "history", not for chat management. | **ASM-09:** one conversation per browser (single `localStorage` history); no conversation list; a clear-history control is optional (Could) and only with a recorded decision. |
| OQ-10 | UI language and per-message metadata (timestamps)? | The user writes Russian and the agents answer in the user's language; timestamps were explicitly optional. | **ASM-10:** Russian UI strings; per-message timestamps optional (Could) in local time; the model selection is not persisted across reloads (default `deepseek` on load); no other metadata shown. |
| OQ-11 | What is the client's error/retry contract for a failed turn? | The user will hit failures (Ollama down, backend stopped, stream interrupted); the behavior determines what stays in the history. | **ASM-11:** the error is shown in the chat as a distinct message; the failed user turn stays (it can be resent manually); no automatic retry; a partially received answer is kept and marked incomplete, or discarded — the design chooses and records. |
| OQ-12 | Which new dependencies are allowed? | The backend may need the Ktor SSE artifact (`io.ktor:ktor-server-sse` is not in `build.gradle.kts` today); the frontend needs test tooling. | **ASM-12:** only strictly needed additions, recorded in the design: backend may add the Ktor SSE artifact at the same 3.3.3 BOM version; frontend may add dev-only test dependencies; no runtime state/CSS/HTTP libraries (NFR-04). |
| OQ-13 | Does `POST /chat` itself write anything to the databases? | Preserves the data-safety story: the fueling path stays read-only; the weather tool's write is the only DB side effect. | **ASM-13:** no — the chat performs no DB writes of its own; existing tool side effects (the `users` row for `get_weather`) remain unchanged. |
| OQ-14 | Is any text the model produces around tool rounds part of the visible answer? | Decides what streams into the bubble when the model interleaves text and tool calls, and whether the `done` text can differ from the chunks. | **ASM-14:** the visible content is the final assistant answer after the tool rounds; tool rounds surface only through the activity indicator and the trace; if the model emits text with tool calls, the design decides whether to include it, keeping `done.answer` equal to the concatenation of chunks (FR-10). |

## Glossary

- **Ai-Turbo backend** — the existing Kotlin/Ktor/Koog service in `/Users/murkka/Work/ai-project`,
  running locally on `http://localhost:8080`.
- **ai-turbo-web** — the new frontend project `/Users/murkka/Work/ai-turbo-web` created by this feature.
- **Chat / conversation** — the single continuous exchange of user and assistant messages in the UI; its
  state is the message history.
- **Message** — one turn with a `role` (`user`/`assistant`) and `content` (text); the client stores it and
  sends it in `POST /chat` requests.
- **History / session history** — the ordered list of all messages of the conversation; persisted in
  `localStorage` under `ai-turbo-chat-history` (ASM-02).
- **«Живое общение» / streaming / live answer** — the answer text arrives and is rendered piece by piece
  while the model generates it (FR-05, FR-10).
- **Chunk** — one streamed piece of the answer text; **terminal frame** — the `done` event carrying the
  complete answer or the `error` event ending the stream (ASM-03).
- **SSE (Server-Sent Events)** — the `text/event-stream` transport proposed for the answer; consumed in the
  browser with `fetch` + `ReadableStream` because `EventSource` cannot issue a `POST`.
- **Tool** — a Koog-registered function the model may call; the two existing ones are `get_weather`
  (Open-Meteo + a local `users` row) and `find_fueling` (read-only stage lookup by GUID).
- **Unified chat agent** — the new Koog agent whose registry holds both tools and whose system prompt
  covers both domains (ASM-01).
- **Пролив (fueling)** — one refuelling transaction of an order; looked up by GUID in the stage database.
- **GUID** — the fueling order identifier in the canonical `8-4-4-4-12` hex form, e.g.
  `61574131-999F-48C9-93AE-3EAA68562177` (the stage-verified example from the backend README).
- **`model` field / `LlmTarget`** — the existing per-request provider selector (`local` = Ollama
  `qwen3:8b`, `deepseek` = DeepSeek `deepseek-flash`, default `deepseek`); the chat reuses it (FR-13).
- **ProviderRoutingPromptExecutor / LoggingPromptExecutor** — the existing routing executor (per-request
  provider choice) and the logging decorator around each provider.
- **Trace chain** — the ordered `stage=` log lines (`inbound`, `deepseek-request`, `deepseek-response`,
  `tool`, `db`, `outbound`) on logger `com.aiturbo.trace`, tied together by one `req=` correlation id.
- **`VITE_API_BASE_URL` / Vite dev-proxy** — the single backend-address constant (default
  `http://localhost:8080`) and the development proxy that avoids CORS changes (ASM-07).
- **Offline tests** — the project-wide rule: no test (backend or frontend) requires a real database, a
  live LLM, a running backend or network access; fakes/mocks only.
- **Harness / pipeline** — the project agents (`code-style-checker`, `reviewer-correctness`,
  `reviewer-deduplication`, `reviewer-git`) and the `/feature-design` → `/feature-implementation` flow
  with its `CLAUDE.md` discipline (verdict-only build output, no secrets, no unprompted commits).

---

# React Chat Web — System Design

Status: design for implementation (step 2 of `/feature-design`). Requirements source:
`docs/features/react-chat-web/01-requirements.md`. Two repositories are touched:
`/Users/murkka/Work/ai-turbo-web` (new React app) and `/Users/murkka/Work/ai-project` (additive chat slice).

## Context and goals

The feature adds the first browser client for the ai-turbo backend: a React + TypeScript + Vite chat
window where the operator asks about the weather or about a fueling order («пролив») by GUID, sees the
answer appear progressively, and keeps a real conversation history (browser-stored, replayed to the
model on every request). The backend gains one additive slice — `POST /chat`, served by one unified Koog
agent whose registry holds both existing tools (`get_weather`, `find_fueling`) — while `/weather`,
`/fueling`, `/time`, the tools and all 250 existing offline tests keep their contracts and stay green.
The transport is an SSE-style event stream over `POST` (the browser consumes it with `fetch` +
`ReadableStream`, because `EventSource` is GET-only), the provider is chosen per request through the
existing `model` field, and both projects keep the offline-test discipline and the trace chain they have
today.

The two pivots of this design, both derived from verifications against the real Koog 1.2.0 sources
(see `## Decisions and alternatives`):

1. **History replay** is done by seeding the agent's session prompt with the client's turns before the
   first request (`appendPrompt { … }`), then requesting with the last user message — the model sees one
   coherent conversation: `system, user, assistant, …, user`.
2. **Streaming** is real provider streaming, but only for the rounds that produce the visible answer:
   the first round (which carries the tool definitions) stays non-streaming, every round after a tool
   result is streamed with `requestLLMStreaming()`. The reason is a hard Koog 1.2.0 fact: the Ollama
   streaming client **drops tool definitions**, so a streamed first round would silently break
   `get_weather`/`find_fueling` for `model=local`.

## Architecture overview

```
┌─ Browser (React+TS+Vite dev server :5173) ────────────────────────────────────────────┐
│  App.tsx                                                                             │
│   ├─ ModelSelector ─ ChatWindow ─ MessageList ─ MessageBubble / ErrorBanner          │
│   └─ ChatInput                                                                       │
│  useChat (messages, isStreaming)  ── chatStorage (localStorage ai-turbo-chat-history)│
│  api/chatApi.streamChat()  ── api/sse (frame parser)                                 │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                 POST /chat  (relative URL → Vite dev-proxy, no CORS)
                                    ▼
┌─ Backend (Ktor :8080) ───────────────────────────────────────────────────────────────┐
│  plugins/ChatRouting.kt   post("/chat")                                              │
│    ├─ receive ChatRequest            → chat/ChatRequestValidator (pure)   → 400 JSON │
│    ├─ LlmTarget.fromRequest(model)                                        → 400 JSON │
│    ├─ llm/ProviderAvailability                                            → 503 JSON │
│    └─ SSE writer: respondTextWriter(ContentType.Text.EventStream)                    │
│         └─ withContext(CallTrace + LlmTargetContext(target))                         │
│              └─ chat/ChatAgent.stream(ChatSession): Flow<String>   (chunks)          │
│                   └─ chat/KoogChatAgent = AIAgent<ChatInput,String>, functionalStrategy
│                        ├─ PromptExecutor = llm/ProviderRoutingPromptExecutor         │
│                        │     ├─ log/LoggingPromptExecutor(deepseek) → OpenAILLMClient│
│                        │     └─ log/LoggingPromptExecutor(ollama)   → OllamaClient   │
│                        └─ ToolRegistry(chat) = get_weather + find_fueling            │
│                              ├─ tools/GetWeatherTool → resolver/Open-Meteo/Postgres  │
│                              └─ tools/FindFuelingTool → stage DB (read-only)         │
│  trace: com.aiturbo.trace  req=… stage=inbound|deepseek-request|deepseek-response|   │
│         tool|db|outbound                                                             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Data flow for one chat turn: the browser posts the full history → the route validates, logs `inbound`,
resolves the provider and answers pre-stream `400`/`503` as plain JSON → it opens the event stream,
creates the SSE-correlated coroutine context and asks `ChatAgent.stream(session)`. The agent seeds the
Koog prompt with the history, runs the tool loop, and pushes the visible answer text pieces into the
agent's `Flow<String>`; the route re-emits every piece as one `chunk` frame and closes with exactly one
terminal `done` frame (`answer` = concatenation of the chunks) or an `error` frame. The browser appends
chunks to the in-progress bubble and persists the completed turn.

## Components

### Backend

**`plugins/ChatRouting.kt` (new)** — `fun Route.chatRoutes()`, resolved from Kodein lazily like
`weatherRoutes()`/`fuelingRoutes()`. Owns: the request DTOs (`ChatRequest`, `ChatMessageDto`), the SSE
frame DTOs (`ChatChunkFrame`, `ChatDoneFrame`, `ChatErrorFrame`), the validation call, the pre-stream
availability check, the SSE writer, the in-stream error mapping, and the `outbound` trace line.
Registered from `configureRouting()` as `chatRoutes()`. Interfaces:

- `post("/chat")` — see `## API design` for the contract.
- `internal fun sseFrame(event: String, data: String): String` — renders one frame (`event: …\ndata: …\n\n`).
- `internal fun inStreamFailure(error: Throwable): ChatErrorFrame` — maps a post-stream-open failure to
  the frame (mirror of the StatusPages texts, see D-08).

**`chat/ChatRequestValidator.kt` (new)** — pure, no Ktor, no LLM:
`object ChatRequestValidator { fun validate(request: ChatRequest): String?; fun toSession(request: ChatRequest): ChatSession }`.
`validate` returns the error text or `null`; `toSession` maps the DTO list to the domain model
(history = all messages but the last, `message` = the trimmed last message). Unit-testable without a
server.

**`chat/ChatAgent.kt` (new)** — the domain contract of the slice, mirroring `WeatherAgent`/`FuelingAgent`:

```kotlin
fun interface ChatAgent {
    /** Emits the visible answer text pieces in order; the flow completes when the turn is over. */
    fun stream(session: ChatSession): Flow<String>
}

data class ChatSession(val history: List<ChatTurn>, val message: String)
data class ChatTurn(val role: ChatTurnRole, val content: String)
enum class ChatTurnRole { USER, ASSISTANT }
```

**`chat/KoogChatAgent.kt` (new)** — `class KoogChatAgent(executor: PromptExecutor, toolRegistry: ToolRegistry, model: LLModel, maxToolRounds: Int = 3) : ChatAgent`.
Holds `AIAgent<ChatInput, String>` built with `.id("chat-agent")`, `.promptExecutor(executor)`,
`.llmModel(model)`, `.systemPrompt(CHAT_SYSTEM_PROMPT)`, `.temperature(0.0)`, `.maxIterations(10)`,
`.toolRegistry(toolRegistry)` and a functional strategy named `"chat"`. `ChatInput` is a private data
class `(history: List<ChatTurn>, message: String, emit: suspend (String) -> Unit)`; `stream()` is a
`channelFlow` that runs the agent with `emit = { send(it) }`, and sends the agent's returned answer as a
last resort when nothing was emitted (so the client always receives text). The strategy (pseudocode,
the exact shape is the implementation's job):

```
appendPrompt { history: USER → user(content), ASSISTANT → assistant(content) }
response = requestLLM(message)                     // round 0: tool round, non-streaming (D-04)
if no tool calls in response: emit(text(response)); return it
while rounds < maxToolRounds:
    calls = response tool calls; if empty break
    results = executeTools(calls); TraceLog.tool(...) per call, exactly like the other agents
    frames = llm.writeSession { results.forEach { toolResult(it.toMessagePart()) }; requestLLMStreaming() }
    collected = StreamedAssistant(); frames.collect { collected.accept(it); if (it is TextDelta) emit(it.text) }
    response = collected.toMessage(); appendPrompt { message(response) }   // streaming does not self-append
    rounds++
if response still has tool calls: warn "tool loop did not converge" (same as the other agents)
return the visible text (or the shared fallback "Не удалось сформировать ответ.")
```

`CHAT_SYSTEM_PROMPT` is one Russian text that combines both tools' rules: answer in the user's
language; on any weather question always call `get_weather` and answer only from its result; on a
question containing an order GUID always call `find_fueling`; without a GUID ask for the order id and
do not call the tool; use the earlier conversation to resolve follow-ups (e.g. a city mentioned
before); never invent data, never mention tool names, never print JSON; on a tool error explain it in
plain language.

**`llm/ProviderAvailability.kt` (new)** — the pre-stream provider check, secret-free:

```kotlin
data class ProviderAvailability(val deepseekConfigured: Boolean) {
    /** null when the target can serve a request; the 503 message otherwise. */
    fun unavailableReason(target: LlmTarget): String?
}
```
`DEEPSEEK` with a blank key → `"DeepSeek API key is not configured"` (the message the routing executor
already throws); `LOCAL` → `null` (Ollama availability is discovered at call time, D-09).

**`llm/StreamedAssistant.kt` (new)** — one accumulator shared by the agent and the logging decorator:
`class StreamedAssistant { fun accept(frame: StreamFrame); fun text(): String; fun toMessage(): Message.Assistant }`.
Text comes from `StreamFrame.TextDelta` only (the same rule Koog's own `collectText()` uses, so
`TextComplete` is never double-counted); tool calls come from `StreamFrame.ToolCallComplete`
(`MessagePart.Tool.Call(id, name, content)`).

**`llm/ProviderRoutingPromptExecutor.kt` (modify, additive)** — adds the resolved-model streaming
overload, mirroring the existing `execute(prompt, ResolvedModel, tools)` (D-10):
`override fun executeStreaming(prompt: Prompt, model: ResolvedModel, tools: List<ToolDescriptor>): Flow<StreamFrame>`
with the same `when (currentLlmTarget())` routing, `localModel` on the local branch and
`model.effectiveModel` on the deepseek branch; the element is still read when the flow is collected.

**`log/LoggingPromptExecutor.kt` (modify, additive)** — `executeStreaming` keeps logging
`stage=deepseek-request … streaming=true` before the delegate is touched, and now also logs the outcome
once the stream is over: frames pass through an accumulator and a `stage=deepseek-response` line (same
shape as the non-streaming line, `text="…" tool_calls=[…]`) or `stage=deepseek-failure`-style
`deepseekFailure` line on an error; `CancellationException` is rethrown with no response line. Frames
are neither filtered nor reordered (transparency kept). This closes FR-14/NFR-06, which require
request **and** response lines for every provider round (D-11).

**`Application.kt` (modify)** — `appModules` gains `bind<ProviderAvailability>() with singleton { ProviderAvailability(deepseek.apiKey.isNotBlank()) }`;
a new additive module is added next to `fuelingModule`:

```kotlin
const val CHAT_TOOL_REGISTRY = "chatToolRegistry"

fun chatModule(): DI.Module = DI.Module(name = "chat") {
    bind<ToolRegistry>(tag = CHAT_TOOL_REGISTRY) with singleton {
        ToolRegistry.builder().tool(instance<GetWeatherTool>()).tool(instance<FindFuelingTool>()).build()
    }
    bind<ChatAgent>() with singleton { KoogChatAgent(instance(), instance(tag = CHAT_TOOL_REGISTRY), instance()) }
}
```
and `Application.module` imports it (`chatModule()`), unconditionally: the local path must work with a
blank DeepSeek key, and the DeepSeek 503 is produced by `ProviderAvailability` (route) and by the
routing executor (defense in depth). `GetWeatherTool` (bound untagged in `appModules`) and
`FindFuelingTool` (bound in `fuelingModule`) are shared, not duplicated — the weather and fueling
registries stay single-tool (FR-15).

### Frontend

**`src/api/sse.ts` (new)** — pure SSE frame parser, no I/O: `createSseParser(): { push(text: string): SseEvent[] }`
where `SseEvent = { event: string; data: string }`. Handles `\r\n`/`\n`, multiple `data:` lines (joined
with `\n`), comment lines (`:`) and `id:`/`retry:` ignored, and partial frames split across reads (the
buffer is kept between `push` calls). Fully unit-testable offline.

**`src/api/chatApi.ts` (new)** — the backend client: types (`ChatRequestMessage`, `ChatRequest`,
`ModelChoice`), the URL constant and the streaming call.

```ts
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:8080')

export class ChatRequestError extends Error { constructor(message: string, readonly status?: number) }

/** POSTs the history, delivers each answer piece through onChunk, resolves with the terminal answer. */
export async function streamChat(
  request: ChatRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string>
```
Implementation contract: `fetch(\`${API_BASE_URL}/chat\`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(request), signal })`.
`!response.ok` → read the JSON `{error}` and throw `ChatRequestError(error, response.status)` (a
non-JSON body falls back to the status text). A `content-type` that is not `text/event-stream` → throw
`ChatRequestError('Неожиданный ответ сервера')`. Otherwise read `response.body.getReader()`, decode with
`TextDecoder('utf-8')` (streaming), feed the parser, and: `chunk` → `onChunk(text)`; `done` → resolve
with `answer`; `error` → throw `ChatRequestError(error, status)`; a stream that ends without a terminal
frame → throw `ChatRequestError('Соединение прервано')`.

**`src/hooks/chatStorage.ts` (new)** — the storage layer of the hook, pure and testable:
`loadMessages(): ChatMessage[]` (missing key / invalid JSON / non-array → `[]`; every entry is
validated and invalid entries are dropped) and `saveMessages(messages: ChatMessage[]): void`
(wrapped in `try/catch`, so a quota/disabled-storage error never breaks the app). Key:
`ai-turbo-chat-history`.

**`src/hooks/useChat.ts` (new)** — the single state owner. Returns
`{ messages, model, setModel, isStreaming, send }`. Responsibilities: initialize from
`loadMessages()`; append the user message immediately; build the request from the *current* list
(errors excluded, local fields stripped); open a placeholder assistant message and append chunks into
it; on success keep it; on failure remove the placeholder and append an `error` entry (D-13); persist
via a `useEffect` on `messages` (one source of truth); abort an in-flight request on unmount; ignore
sends with blank input and sends while `isStreaming`. Request mapping:
`messages.filter(m => m.kind !== 'error').map(m => ({ role: m.kind, content: m.content }))` plus the new
user turn, `model` always sent.

**`src/types.ts` (new)** — `MessageRole = 'user' | 'assistant'`, `MessageKind = MessageRole | 'error'`,
`ChatMessage = { id: string; kind: MessageKind; content: string }`, `ModelChoice = 'local' | 'deepseek'`.
No `any`; no other exports.

**`src/components/` (new)** — one component per file, PascalCase:

| File | Responsibility / interface |
|---|---|
| `ChatWindow.tsx` | scroll container; keeps the view pinned to the newest content (`scrollIntoView({ block: 'nearest' })` only when the user is near the bottom); props `{ messages, isStreaming }` |
| `MessageList.tsx` | `role="log"`, `aria-live="polite"`; maps messages to `MessageBubble` (user/assistant) or `ErrorBanner` (kind `error`); renders the activity indicator (`role="status"`, «Ассистент печатает…») for the in-progress assistant message |
| `MessageBubble.tsx` | one message; `aria-label="Сообщение пользователя"/"Ответ ассистента"`, distinct classes `message message--user` / `message--assistant`; renders the text as plain text (no markdown) |
| `ErrorBanner.tsx` | `role="alert"`, class `message message--error`; the presentation of an error entry |
| `ChatInput.tsx` | single-line `<input>` + send `<button>`; a `<label>` (visually hidden) or `aria-label`; Enter sends, blank cannot be sent, both disabled while `isStreaming`; keeps focus after send |
| `ModelSelector.tsx` | `<label>` + `<select>` with `local`/`deepseek`, `value` = the current model, default `deepseek` |

**`src/App.tsx` (new)** — composes the header (title + `ModelSelector`), `ChatWindow` and `ChatInput`
from `useChat()`. **`src/main.tsx` / `src/index.css`** — the React root (`StrictMode` kept) and plain
CSS (bubbles, layout, the activity indicator animation). No CSS framework, no state library
(`CODE_STYLE.md`).

**Project scaffolding (one-off, recorded):** in `/Users/murkka/Work/ai-turbo-web` run
`npm create vite@latest . -- --template react-ts` and answer **"Ignore files and continue"** (the
directory already holds `CLAUDE.md`, `CODE_STYLE.md`, `.claude/`, `docs/`); when the CLI runs
non-interactively, scaffold into a temporary sibling directory and copy the generated files
(`package.json`, `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`, `vite.config.ts`,
`index.html`, `eslint.config.js`, `.gitignore`, `src/`) into the project. Then delete the template's
`src/App.css`, `src/assets/`, and the demo content of `src/App.tsx`/`src/index.css`; `npm install`; add
the dev-only test tooling
(`npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`)
and record the resolved versions in `package.json`. Dev dependencies are the only additions (D-14).

**`vite.config.ts`** — `defineConfig` from `vitest/config`, the `react()` plugin, the dev proxy
`server: { proxy: { '/chat': { target: 'http://localhost:8080', changeOrigin: true } } }` and
`test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }`. **`src/test/setup.ts`**:
`import '@testing-library/jest-dom/vitest'` plus `afterEach(cleanup)` (RTL does not auto-clean without
globals).

### Logging and trace chain (cross-cutting)

One chain per chat request on logger `com.aiturbo.trace`, one `req=` id, stages in order:

| Stage | Emitted by | Content for `/chat` |
|---|---|---|
| `inbound` | `call.beginTrace(body)` in `ChatRouting` | `method=POST path=/chat … body=<ChatRequest JSON>` (truncated at 4096, `model` rendered only when sent — the same `@EncodeDefault(NEVER)` DTO trick as `/weather`) |
| `deepseek-request` | `LoggingPromptExecutor` | endpoint/model/tools of every round; `streaming=true` on the streamed rounds; `messages=[system: "…", user: "…", assistant: "…", …]` proves the history replay (FR-12) |
| `deepseek-response` | `LoggingPromptExecutor` | per round: the non-streamed answer as today; for a streamed round the assembled `text="…" tool_calls=[…]` after the stream ends (D-11) |
| `tool` | `KoogChatAgent` strategy | one line per executed tool call (`tool=get_weather` / `tool=find_fueling`, args, result, `is_error`), same renderer as the other agents |
| `db` | the tools themselves | unchanged (`GetWeatherTool` save, `FindFuelingTool` lookup) |
| `outbound` | `ChatRouting` | `status=200 body={"event":"done","answer":"…","model":"deepseek"}` (or the `error` frame body) at the end of the stream; `status=400/503` with the JSON error body for the pre-stream failures |

No configuration object, header or secret ever reaches `TraceLog`; the request body is the client's
own conversation and is truncated like every other body. A client disconnect mid-stream cancels the
coroutine and leaves the chain without `outbound` (same as the existing routes on cancellation; D-12
in `## Decisions`).

### File inventory

Backend — create:

| File | Content |
|---|---|
| `src/main/kotlin/com/aiturbo/chat/ChatAgent.kt` | `ChatAgent`, `ChatSession`, `ChatTurn`, `ChatTurnRole` |
| `src/main/kotlin/com/aiturbo/chat/ChatRequestValidator.kt` | `ChatRequestValidator.validate/toSession` |
| `src/main/kotlin/com/aiturbo/chat/KoogChatAgent.kt` | the unified agent + `CHAT_SYSTEM_PROMPT` |
| `src/main/kotlin/com/aiturbo/llm/ProviderAvailability.kt` | `ProviderAvailability.unavailableReason` |
| `src/main/kotlin/com/aiturbo/llm/StreamedAssistant.kt` | frame accumulator → `Message.Assistant` |
| `src/main/kotlin/com/aiturbo/plugins/ChatRouting.kt` | DTOs, frames, `Route.chatRoutes()` |
| `src/test/kotlin/com/aiturbo/ChatRequestValidatorTest.kt` | the validation matrix (pure) |
| `src/test/kotlin/com/aiturbo/ChatRoutesTest.kt` | HTTP contract, frames, 400/503, in-stream error, trace |
| `src/test/kotlin/com/aiturbo/KoogChatAgentTest.kt` | history→prompt, tool round, streaming, fallback |
| `src/test/kotlin/com/aiturbo/ChatModulesTest.kt` | the chat registry holds both tools; availability flag; blank key |
| `src/test/kotlin/com/aiturbo/ChatChainIntegrationTest.kt` | the full offline chain through the real agent + a scripted executor |
| `src/test/kotlin/com/aiturbo/StreamedAssistantTest.kt` | frame assembly (text deltas, tool calls, no double-count) |

Backend — modify:

| File | Change |
|---|---|
| `src/main/kotlin/com/aiturbo/Application.kt` | bind `ProviderAvailability`, add `chatModule()`, import it |
| `src/main/kotlin/com/aiturbo/plugins/Routing.kt` | call `chatRoutes()` in the routing block (nothing else) |
| `src/main/kotlin/com/aiturbo/llm/ProviderRoutingPromptExecutor.kt` | the resolved-model streaming override |
| `src/main/kotlin/com/aiturbo/log/LoggingPromptExecutor.kt` | the streamed outcome line |
| `src/test/kotlin/com/aiturbo/LoggingPromptExecutorTest.kt` | update the streamed-call expectation (2 lines: request + response) and add the error case |
| `src/test/kotlin/com/aiturbo/ProviderRoutingPromptExecutorTest.kt` | add the resolved-model streaming routing test |
| `README.md` | the `/chat` section: contract, frames, `curl -N` example, trace, model field |

Frontend — create: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`,
`index.html` (`lang="ru"`), `.gitignore`, `README.md`, `src/main.tsx`, `src/App.tsx`, `src/index.css`,
`src/types.ts`, `src/api/chatApi.ts`, `src/api/sse.ts`, `src/hooks/useChat.ts`,
`src/hooks/chatStorage.ts`, `src/components/{ChatWindow,MessageList,MessageBubble,ErrorBanner,ChatInput,ModelSelector}.tsx`,
`src/test/setup.ts`, and the co-located tests `src/api/sse.test.ts`, `src/api/chatApi.test.ts`,
`src/hooks/chatStorage.test.ts`, `src/hooks/useChat.test.tsx`,
`src/components/{ChatInput,MessageList,ModelSelector}.test.tsx`, `src/App.test.tsx`.
Frontend — modify: none (the project is empty today); `CLAUDE.md`/`CODE_STYLE.md` stay untouched.

## API design

### `POST /chat`

Request (identical shape to the requirement's ASM-01 default):

```json
{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],
 "model":"deepseek"}
```

| Field | Type | Rules |
|---|---|---|
| `messages` | array, required | non-empty; ordered oldest → newest; unknown extra fields tolerated (`ignoreUnknownKeys`) |
| `messages[i].role` | string | `user` or `assistant` (trimmed, case-insensitive); a `system` role is rejected (the system prompt is backend-owned, ASM-05) |
| `messages[i].content` | string | non-blank after trimming; sent to the model trimmed |
| `messages[last].role` | string | must be `user` |
| `model` | string, optional | absent/blank → `deepseek`; `local`/`deepseek` case-insensitive; anything else → `400` (identical to `/weather`, `/fueling`) |

Validation happens before any LLM or tool call, in this order, each violation answered as
`400 {"error":"…"}` (JSON, no stream opened, no provider line in the log):

| Case | `error` text |
|---|---|
| `messages` absent/empty | `Field 'messages' must not be empty` |
| unknown role at index *i* | `Field 'messages[i].role' must be one of: user, assistant` (index rendered as `[i]` per offending entry) |
| blank content at index *i* | `Field 'messages[i].content' must not be blank` |
| last message not from the user | `The last message must be from the user` |
| unknown non-blank `model` | `Field 'model' must be one of: local, deepseek` (reuses `LlmTarget.ALLOWED_VALUES`) |

Pre-stream provider check (after validation): `model=deepseek` with a blank DeepSeek key →
`503 {"error":"DeepSeek API key is not configured"}` with no stream and no provider line (FR-09). A
malformed/unparsable body keeps the existing behavior (`400 {"error":"Invalid request body"}` from
StatusPages).

Success: `200` with `Content-Type: text/event-stream` (chunked, `respondTextWriter`), frames in order,
exactly one terminal frame, then close. No `Content-Length`, no compression.

### Stream frames

```
event: chunk
data: {"text":"Сейчас "}

event: chunk
data: {"text":"в Москве "}

event: done
data: {"answer":"Сейчас в Москве +15.4°C, облачно, пояс Europe/Moscow","model":"deepseek"}
```

```
event: error
data: {"status":503,"error":"LLM provider is unavailable"}
```

| Frame | Payload | Semantics |
|---|---|---|
| `chunk` | `{"text": "<piece>"}` | zero or more, in order; append to the in-progress answer |
| `done` | `{"answer":"<full text>","model":"local"｜"deepseek"}` | exactly one terminal frame on success; `answer` **equals the concatenation of all `chunk.text`** by construction (both are the route's accumulator) |
| `error` | `{"status":<int>,"error":"<message>"}` | exactly one terminal frame on failure after the stream opened; `status` is the intended HTTP status (`503` provider/database unavailable, `500` otherwise) |

Invariants (FR-10): frames are separated by a blank line; every `data` is a single-line compact JSON
(so one `data:` line per frame — the JSON encoder escapes any newline); after the terminal frame the
stream closes; the pre-stream `400`/`503` bodies stay JSON, never frames. No heartbeat/`id:`/`retry:`
frames (D-06) and no progress frame for tool rounds (D-07). On an in-stream failure the route maps the
throwable to `{status, error}` with the same texts the StatusPages uses
(`LLM provider is unavailable`, `Database is unavailable`, `Internal server error`, or the
`WeatherUnavailableException` message) — see D-08.

Backend-internal interfaces (exact signatures are in `## Components`):
`ChatAgent.stream(ChatSession): Flow<String>`, `ChatRequestValidator.validate/toSession`,
`ProviderAvailability.unavailableReason(LlmTarget): String?`,
`StreamedAssistant.accept/toMessage`, `chatModule()`, `CHAT_TOOL_REGISTRY`.

Frontend-internal interfaces: `streamChat(request, onChunk, signal): Promise<string>`,
`ChatRequestError(message, status?)`, `createSseParser(): { push(text): SseEvent[] }`,
`useChat(): { messages, model, setModel, isStreaming, send }`, `loadMessages()/saveMessages()`.

### Configuration

Backend: **no `application.conf` change** (D-15). The chat reuses `deepseek.*`, `ollama.*` (including
`timeoutSeconds` as the stream read budget) and the existing env/`.env` resolution; `maxToolRounds`
stays a constructor default (3) like the other agents; there is no history cap (D-16, ASM-05). No new
dependency is added to `build.gradle.kts` (D-05 rejects `ktor-server-sse`).

Frontend: `VITE_API_BASE_URL` is the single backend-address constant. In dev it is unset, so
`API_BASE_URL` is `''` and requests go to the relative `/chat`, which `vite.config.ts` proxies to
`http://localhost:8080` (no CORS, ASM-07); outside dev the default is `http://localhost:8080`, and an
explicit value (e.g. `.env.local`) overrides it for a split-origin deployment (out of scope, recorded).
Scripts: `dev`, `build` (`tsc -b && vite build`), `typecheck` (`tsc -b`), `test` (`vitest run`),
`test:watch` (`vitest`), `preview`. Nothing secret is read or stored by the app.

## Data model

**Frontend (the only persisted state).** `localStorage["ai-turbo-chat-history"]` holds a JSON array of
`ChatMessage` objects in conversation order:

```json
[{"id":"0f1c…","kind":"user","content":"Какая сейчас погода в Москве?"},
 {"id":"9a2b…","kind":"assistant","content":"Сейчас в Москве +15.4°C, облачно…"}]
```

- `id` (string, `crypto.randomUUID()`) and `kind` are **local-only**; `kind` is one of
  `user`/`assistant`/`error`.
- On load, every entry is validated (`id`/`kind`/`content` present and of the right type, `kind` in the
  allowed set); invalid entries are dropped, a non-array/invalid JSON/absent key yields `[]` (FR-03).
- `error` entries are rendered in the list but never sent; `id`/`kind` are stripped when building the
  request, so the wire model is exactly `{role, content}` (FR-04).
- No timestamp, no provider, no token data (D-17); the only key written is `ai-turbo-chat-history`;
  no secret is ever stored (FR-08/NFR-03).

**Wire model.** Request `{messages:[{role,content}], model?}`; response frames as in `## API design`.
The stored and wire models are deliberately different: storage carries UI concerns, the wire carries
only what the backend contract accepts.

**Backend in-memory conversation.** The Koog `Prompt` of one agent run: `[system(CHAT_SYSTEM_PROMPT)] +
history turns (user/assistant) + the request's user message + per tool round (assistant tool call,
tool results, assistant answer)`. It exists only for the duration of the request; the agent is a
stateless singleton and each `run` starts from the config prompt (no cross-request state).

**Databases.** No schema change, no migration, no new query: `POST /chat` writes nothing itself
(ASM-13). The only write remains `GetWeatherTool`'s `users` row, and `find_fueling` stays read-only.

## Key flows

**1. Weather question, streamed (E2E-1, E2E-5).** The operator picks `deepseek`, types «Какая сейчас
погода в Москве?» and presses Enter. `useChat` appends the user bubble, persists, and calls
`streamChat({messages:[{role:'user',content:'…'}], model:'deepseek'}, onChunk)`. The route logs
`inbound` (with the body), validates, resolves `LlmTarget.DEEPSEEK`, checks the key, opens the stream
and runs the agent inside `withContext(trace + LlmTargetContext(DEEPSEEK))`. The agent seeds the prompt
(no history yet), calls `requestLLM(message)`: the model returns a `get_weather` tool call →
`stage=deepseek-request`/`deepseek-response` (with `tool_calls=[…]`) → the tool executes (Open-Meteo,
time-zone resolution, the `users` insert) with `stage=tool` and `stage=db` → the results are appended
and `requestLLMStreaming()` starts the answer round (`stage=deepseek-request … streaming=true`); every
`TextDelta` is emitted as a `chunk` frame and appended to the bubble. The stream ends: the route sends
`done` (`answer` = everything streamed) and logs `outbound status=200 body={"event":"done",…}`; the
`stage=deepseek-response` line for the streamed round carries the assembled text. The user sees ≥ 3
visible steps and the activity indicator from the first moment.

**2. Follow-up «А завтра?» (E2E-2, FR-12).** The browser sends both earlier turns plus the new one.
`ChatRequestValidator.toSession` puts the two earlier turns into `history`; the strategy's
`appendPrompt { user(…); assistant(…) }` places them between the system message and the new user
message. The first `deepseek-request` line therefore shows
`messages=[system: "…", user: "Какая сейчас погода в Москве?", assistant: "Сейчас в Москве …", user: "А завтра?"]`
and the model resolves «завтра» from the earlier answer, calling `get_weather` again with Moscow. Edge
cases: a history whose last entry is an assistant turn is impossible (validation requires the last
message to be from the user); a history containing an error entry is impossible (errors are stripped
client-side); a `system` role from a hand-crafted client is rejected with `400`.

**3. Fueling by GUID in the same conversation (E2E-3).** «Найди данные по проливу для заказа
61574131-999F-48C9-93AE-3EAA68562177» → the same flow, but the model calls `find_fueling`: the chat
registry holds both tools, so no routing heuristics are involved; `stage=tool tool=find_fueling`,
`stage=db tool=find_fueling lookup=found …`, and the streamed answer summarises the stage row. The
following weather question in the same conversation works symmetrically, and neither question
disturbs the weather/fueling slices (single-tool registries).

**4. Error paths (FR-07, FR-09, NFR-05d).** (a) *Validation*: an empty list / unknown role / blank
content / last-not-user / unknown model → `400 {"error":…}` JSON, `stage=inbound` + `stage=outbound
status=400`, no provider or tool line; the client sees a non-`text/event-stream` response, parses the
JSON and appends an error entry — the history is intact and the next send works. (b) *Blank DeepSeek
key*: `503 {"error":"DeepSeek API key is not configured"}` before the stream opens. (c) *Ollama down
with `model=local`*: the first (tool) round fails inside the already-open stream → the route sends
`event: error` `{"status":503,"error":"LLM provider is unavailable"}` and closes; the client throws
`ChatRequestError`, removes the empty placeholder and shows the error; the earlier turns survive and
are re-sent with the next message. (d) *Backend stopped*: `fetch` rejects, same handling, no fake
answer. (e) *Client disconnect mid-stream*: the coroutine is cancelled, the agent stops, no `outbound`
line (D-12). (f) *Corrupted storage*: `loadMessages` yields `[]` or a filtered list, the app starts
normally.

**5. Reload and continue (E2E-6).** `useChat` initialises from `loadMessages()`, so after a reload the
messages render in the original order; the model selector is back to `deepseek` (not persisted, D-17).
The next question is sent with the restored history and the model answers from it — the flow of
scenario 2 with a longer history.

## Decisions and alternatives

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D-01 | One new unified `POST /chat` served by `KoogChatAgent` with a third registry (`CHAT_TOOL_REGISTRY`) holding both tools; `/weather`, `/fueling`, `/time` untouched | Reuse `/weather`+`/fueling` with a router (client-side or a backend heuristic); a mixed agent on a frozen registry | ASM-01 default. A router would need request classification before the model sees the question and would put a mixed agent (and new tools) on frozen endpoints/registries, risking the 250 tests. `ToolsCount=1` shapes of the existing slices stay byte-identical. |
| D-02 | The chat registry is built from the *existing* tool singletons (`instance<GetWeatherTool>()`, `instance<FindFuelingTool>()`), in a new additive `chatModule()` | Duplicate tool instances for the chat; add the fueling tool to the untagged `ToolRegistry` | One instance per tool = one configuration, one trace behavior, no drift; the untagged registry must stay `get_weather`-only (frozen `AppModulesTest`/`TraceChainIntegrationTest`, D-02 of the fueling feature). |
| D-03 | History replay: `appendPrompt { user/assistant(…) }` for all prior turns, then a single request with the last user message; the system prompt stays backend-owned and a client `system` role is rejected | Pass the history as one concatenated string; a per-request `AIAgent` built with `.prompt(…)`; a `functionalStrategy<Prompt, …>` | Verified in Koog 1.2.0: `requestLLM(message)` appends `user(message)` to the session prompt, so seeding the prompt first yields exactly one turn per message, in order, with the system prompt first (FR-12). Building an agent per request would fight the "model fixed at build time" design and the singleton DI; concatenation loses the turn structure. |
| D-04 | **Streaming pattern:** round 0 (the tool-carrying round) is non-streaming; every round *after* a tool result is streamed with `requestLLMStreaming()`, its deltas re-emitted as chunks, its assembled assistant message appended to the prompt manually | (a) Stream every round; (b) run the agent non-streaming and drip-synthesise the finished answer; (c) make round 0 streaming only for DeepSeek | Verified in Koog 1.2.0: the Ollama streaming client builds its request **without tool definitions** (`executeStreaming` never uses its `tools` parameter), so a streamed round cannot call tools with `model=local` — (a) would break FR-11/E2E-4 for the local provider. (b) is the ASM-04 fallback: it makes latency dishonest ("живое общение") and is kept only as the documented fallback. (c) is provider-dependent behavior and puts tool calling for the default provider on Koog's unverified OpenAI streaming tool-call assembly. Consequence, recorded honestly: the answer streamed through this pattern is the post-tool round (every weather/fueling/follow-up case in E2E-1…E2E-5); a *direct* answer (round 0 with no tool call) reaches the client as one chunk. Follow-up option: stream round 0 too once (c) is verified — surfaced to the user in `## Open questions`. |
| D-05 | SSE over `POST` implemented with `call.respondTextWriter(ContentType.Text.EventStream)` and a 10-line frame renderer; **no new backend dependency** | `ktor-server-sse` + `Route.sse(…)`; a two-channel GET-SSE + POST design | Ktor 3.3.x exposes `sse` only as `Route.sse` (no `ApplicationCall.sse`); it is GET-oriented, and reading a POST body inside a plugin-managed route is undocumented. `respondTextWriter` (not deprecated in 3.3.x) keeps the method, path and frame bytes exactly as contracted, is unit-testable end to end, and spends no dependency (ASM-12 allows the artifact, does not require it). Cost accepted: heartbeat/`id:`-replay are not implemented (not requested, D-06). |
| D-06 | Three frame types only (`chunk`, `done`, `error`); no heartbeat, no `id:`/`retry`; `done` carries `model` = the request-level selector | The requirement's proposal plus a `progress`/`status` frame; heartbeats | ASM-03 semantics kept (chunk→terminal ordering, `done.answer` = concatenation, error = terminal). Chat turns are short-lived (seconds), so keep-alive noise is not needed; the activity indicator already covers the tool rounds (FR-05). |
| D-07 | No progress frame for tool rounds | `event: status {"stage":"tools"}` | Unrequested UI surface (the answer metadata is explicitly out of scope); the indicator plus the trace cover observability. |
| D-08 | In-stream failures are mapped by a small chat-local helper whose texts mirror the StatusPages ones | Refactor `Routing.kt` into a shared mapper; let the exception propagate and end the stream without a terminal frame | The SSE response is already committed when the failure happens, so StatusPages cannot be reused; a shared mapper would touch the frozen slice's file for no behavioral gain. Letting it propagate would violate FR-10 ("never a silent hang") and NFR-06 (no `outbound`). |
| D-09 | `ProviderAvailability` (a secret-free boolean value, bound in `appModules`) gates the DeepSeek path pre-stream → JSON `503`; Ollama availability is discovered at call time | Bind `DeepseekConfig` (the key would become resolvable from DI); ping Ollama before every chat; replace `ChatAgent` with a throwing lambda when the key is blank | FR-09/ASM-01 require the pre-stream `503`; the local path must keep working with a blank key, so a conditional agent binding (the `fuelingModule` pattern) is wrong here. A pre-flight ping would add a network round-trip per request and a second timeout contract; the in-stream error frame plus the existing connect timeout (`10 s`, NFR-05d) covers an unreachable Ollama. |
| D-10 | `ProviderRoutingPromptExecutor` also overrides the resolved-model streaming overload | Rely on the base-class default | The routing class already implements both `execute` overloads — evidence that Koog 1.2.0 calls the `ResolvedModel` shape; the chat is the first production streaming path, so the routing rule is stated explicitly for both shapes instead of depending on a default that may not delegate. A test locks it. |
| D-11 | `LoggingPromptExecutor.executeStreaming` additionally logs the assembled `stage=deepseek-response` (or `deepseekFailure`) line after the stream ends | Log nothing on streamed calls; log the response from the chat layer | `CODE_STYLE.md` fixes the chain `inbound → deepseek-request → deepseek-response → … → outbound` and FR-14/NFR-06 require the provider request/response lines with `streaming=true`. The decorator is the component that sees the frames, so one line shape stays universal. Cost: the frozen `LoggingPromptExecutorTest` streaming expectation changes from 1 line to 2 (allowed by NFR-02 and `CODE_STYLE.md` "правки только там, где меняется конструктор/контракт"); it strengthens, never weakens, the observable contract. |
| D-12 | A client disconnect cancels the request and leaves no `outbound` line | Log a synthetic `outbound` on cancellation | Matches the existing routes' cancellation behavior; a cancelled call has no response to report, and inventing one would misreport the contract. Documented in the logging table. |
| D-13 | A failed turn: the user message stays, the placeholder answer is **discarded**, the error is appended as a distinct `error` entry, no automatic retry | Keep the partial answer marked incomplete; drop the user turn; auto-retry | ASM-11 default (error in the chat, the user turn stays, no retry). A truncated answer would be replayed to the model on the next turn and silently degrade the follow-up; the error entry right below the failed turn explains what happened, and resending is one keystroke. |
| D-14 | Frontend test tooling: Vitest + `@testing-library/react` + `jest-dom` + `user-event` + `jsdom`, all dev-only; no runtime dependency beyond React/Vite (`fetch`, no HTTP client) | A test runner bundled with another framework; adding a runtime HTTP/state library | NFR-01/ASM-08: Vite-native, offline, mocks `fetch`/`ReadableStream`. `CODE_STYLE.md` forbids runtime state/CSS/HTTP libraries; the resolved versions are recorded in `package.json` by the implementer (they are not pinned in this document because the registry is the source of truth). |
| D-15 | No `application.conf` additions | `chat { maxToolRounds, maxHistoryMessages }` knobs | Nothing needs tuning to satisfy the requirements; the existing `ollama.timeoutSeconds` and client timeouts bound a stalled stream (NFR-05d), and `maxToolRounds=3` mirrors the other agents. Fewer knobs = fewer untested paths. |
| D-16 | No server-side history cap in v1 (ASM-05) | Cap the message count/characters; truncate the oldest turns | Not requested; a silent cap would change follow-up behavior invisibly. Documented failure mode: when a session outgrows the model's context window the provider errors and the user sees an `error` frame with the history intact. |
| D-17 | UI in Russian, no timestamps/metadata, the model is not persisted, no clear-history control | Timestamps (ASM-10 "Could"), a persisted selector, a "clear" button (ASM-09 "Could") | Minimalism: each is optional and each adds storage/UI surface; the operator can clear `localStorage` manually. |

## Non-functional coverage

| NFR | How the design covers it |
|---|---|
| NFR-01 Frontend offline tests | Vitest + jsdom; `fetch` and the response stream are mocked (`new Response(new ReadableStream(…))`); covered: `sse.test.ts` (frame parsing incl. split frames), `chatApi.test.ts` (chunks, `done`, error frame, pre-stream `400`/`503`, network failure), `chatStorage.test.ts` (restore/invalid JSON/invalid entries/quota), `useChat.test.tsx` (incremental append, full history in the request body with local fields stripped, error keeps the history, persistence), component tests, `App.test.tsx` happy path. `npm run test` needs no backend, no network, no LLM. |
| NFR-02 Backend offline tests | Fake `ChatAgent` in the route tests, a scripted `PromptExecutor` in the agent tests, `MockEngine`/fakes in the tool/DB paths, `LogCapture` for the trace; nothing connects. Existing tests untouched except `LoggingPromptExecutorTest`'s streaming expectation (D-11) and one additive test in `ProviderRoutingPromptExecutorTest`; the 250 pre-existing tests keep their assertions. |
| NFR-03 Security | No secret in the frontend (no key, no `.env` committed, only the history key in `localStorage`); `ProviderAvailability` carries a boolean, never the key; `TraceLog` receives no configuration object; frames and log lines contain only the conversation and provider messages. Verification: a secrets grep over both projects and over a captured chat log. |
| NFR-04 Compatibility | `/`, `/time`, `/weather`, `/weather/history`, `/fueling` untouched; the tools, their JSON resources and their registries unchanged; backend stack unchanged with no new backend dependency (D-05); frontend stack per `CODE_STYLE.md` with dev-only test deps (D-14). |
| NFR-05 Performance | (a) the indicator is rendered synchronously on send (`isStreaming`); (b) chunks are appended per frame with no batching; (c) the provider's deltas are re-emitted one frame per delta (test with a scripted slow fake, manual `curl -N`); (d) an unreachable provider fails through the existing connect timeout (10 s) or the request timeout (`OLLAMA_TIMEOUT_SECONDS=120`), an in-stream failure always ends in an `error` frame + close, and the client turns a terminal-frame-less stream into an error. |
| NFR-06 Observability | One `req=` chain per chat request with the stages in the logging table, `streaming=true` on streamed rounds, bodies truncated at 4096, `outbound` with the terminal frame; verified by `ChatRoutesTest`/`ChatChainIntegrationTest` (LogCapture) and manually via `grep 'req='`. |
| NFR-07 Browser compatibility | `fetch` + `ReadableStream` + `TextDecoder` + `localStorage` are supported in current Chrome/Safari; no plugin, no extension; no `EventSource` (which cannot POST). |
| NFR-08 Harness discipline | Both projects' `CLAUDE.md`: build/test read as a verdict only, logs only via `req=`/`stage=` grep, reviews by the four project agents, no commit/push without an explicit request; this document and `03-plan.md` are the implementation's only sources. |

### Requirement traceability (FR)

| FR | Design element |
|---|---|
| FR-01 | Scaffolding section + `vite.config.ts` + `src/` structure + `package.json` scripts (`build`, `typecheck`); `CODE_STYLE.md` conformance |
| FR-02 | `ChatWindow`/`MessageList`/`MessageBubble`/`ChatInput`; `useChat.send` |
| FR-03 | `chatStorage.ts` (`ai-turbo-chat-history`, validation, try/catch); `useChat` initialisation/persistence |
| FR-04 | `useChat` request mapping (errors filtered, local fields stripped) + history replay (D-03) |
| FR-05 | SSE `chunk` frames → per-chunk append; `isStreaming` activity indicator; D-04 |
| FR-06 | `ModelSelector` + `model` in every request; default `deepseek`, not persisted |
| FR-07 | `ChatRequestError` paths in `chatApi.ts`/`useChat.ts`; `ErrorBanner`; D-13/D-08/D-09 |
| FR-08 | `API_BASE_URL` + `.env` override + Vite proxy; no secrets |
| FR-09 | `ChatRequestValidator` + validation matrix + `ProviderAvailability` pre-stream `503` |
| FR-10 | Frame contract (chunk/done/error), terminal-frame invariant, error mapping (D-06/D-08) |
| FR-11 | `KoogChatAgent` + `CHAT_SYSTEM_PROMPT` + `CHAT_TOOL_REGISTRY` with both tools (D-01/D-02) |
| FR-12 | History → prompt mapping `appendPrompt { user/assistant }` + `requestLLM(message)` (D-03); trace `messages=[…]` |
| FR-13 | `LlmTarget.fromRequest` + `LlmTargetContext` + `ProviderRoutingPromptExecutor` (reused unchanged), the resolved-model streaming override (D-10) |
| FR-14 | Logging table: `inbound` → provider round lines (`streaming=true`) → `tool`/`db` → `outbound` (D-11) |
| FR-15 | Additive-only changes; single-tool registries kept; frozen tests kept (D-01/D-02/NFR-04) |
| FR-16, FR-17, FR-18, FR-19, FR-20 | Key flows 1, 2, 3, 4(c) and 5 (E2E-1…E2E-4, E2E-6) |
| FR-21 | This document + `03-plan.md`; implementation strictly by plan with the four review agents in both repos |
| FR-22 | `README.md` updates in both projects (file inventory) + the `curl -N` example below |

Manual `curl -N` acceptance aid (also for the README):

```bash
curl -N -X POST http://localhost:8080/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Какая сейчас погода в Москве?"}],"model":"local"}'
```

## Open questions and risks for the planner

Risks (with the mitigation that must be part of the plan):

1. **Koog API drift between this document and the resolved 1.2.0 jar.** The signatures used here were
   read from the 1.2.0 sources (`requestLLM` appends `user(message)` then calls the LLM;
   `requestLLMStreaming` does **not** append the assistant reply — hence the explicit
   `appendPrompt { message(response) }`; `appendPrompt`, `llm.writeSession`,
   `PromptBuilder.toolResult/user/assistant/message` exist; `TextDelta`/`ToolCallComplete`/`End` are the
   frames). Verify by compiling before writing the loop.
2. **Streamed rounds and tools.** Koog's Ollama streaming client ignores `tools`, so (a) `model=local`
   can only call tools in non-streaming rounds (D-04 relies on this), and (b) the trace line of a
   streamed local round reports `tools_count=2` while the wire request carried none — a cosmetic,
   documented discrepancy of Koog 1.2.0, not a code change in this feature.
3. **DeepSeek streaming tool-call assembly** is only exercised if the model asks for a second tool
   round inside a streamed round; the primary flows never need it. If it misbehaves, the tool loop
   simply stops after the first round (the answer is still produced from the executed tool's result).
   Verification: a scripted-executor test plus the E2E walkthrough.
4. **`respondTextWriter` flush granularity** is what makes the stream visible in `curl -N`; unit tests
   read the finished body and cannot prove per-frame flushing. Verification: the manual `curl -N`
   check in step E2E-5 before declaring the feature done; fallback if it does not flush: switch to
   `ktor-server-sse` (allowed by ASM-12) or write through the engine's output stream.
5. **SSE through the Vite dev proxy.** `http-proxy` streams by default and no compression plugin is
   installed on either side, but a buffering regression would look like "the answer appears at once".
   Check in E2E-5; the proxy entry is `changeOrigin: true` and no rewrites.
6. **No history cap (D-16).** A long session eventually exceeds the model's context window: the
   provider errors, the client shows an error frame's message and the history survives. If this is
   observed in practice, a capped/truncated history becomes a follow-up feature (its user-visible
   effect must then be recorded).
7. **Two-project test coordination.** Backend: `./gradlew test` must stay `BUILD SUCCESSFUL` with the
   one updated streaming expectation (D-11) and the additive tests; frontend: `npm run test` must pass
   with no backend running. Both commands are read as verdicts only (NFR-08). The plan should sequence
   the backend slice first (the frontend's contract is what the backend ships).
8. **The `LoggingPromptExecutor` streaming change touches a shared, frozen component.** It is additive
   (an extra line after the stream ends) and the only test change is the streaming expectation; flag it
   to the reviewer as the intentional, recorded exception (D-11/NFR-02).

Open items to surface to the user (default assumptions are recorded; none blocks implementation):

- **OQ-A (from D-04):** a *direct* answer (no tool call in the first round) reaches the UI as one
  content chunk, because that round must carry the tool definitions for the local provider. The
  acceptance criteria for E2E-1…E2E-5 are unaffected (every tool question streams). Default assumption:
  accept for v1; a follow-up can stream round 0 for providers whose streaming carries tools.
- **OQ-B (from D-05/ASM-12):** the backend adds **no** dependency; the Ktor SSE artifact is not used.
  Default assumption: accepted — the frame contract is explicit and testable.
- **OQ-C (from D-06):** no heartbeat/`id`/`retry` and no `progress` frames. Default assumption:
  accepted (no consumer for them; the activity indicator covers the wait).
- **OQ-D (from D-13):** a partially received answer is discarded on failure (the user turn and the error
  entry remain). Default assumption: accepted; the alternative (keep and mark incomplete) is recorded.
- **OQ-E (from D-16):** no server-side history cap in v1. Default assumption: accepted, with the
  documented context-limit failure mode.
- **OQ-F:** the model selection is not persisted across reloads (ASM-10 default) and there is no
  clear-history control (ASM-09 "Could" not taken). Default assumption: accepted.

---

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
