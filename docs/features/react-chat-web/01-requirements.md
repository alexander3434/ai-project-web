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
