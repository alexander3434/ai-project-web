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
