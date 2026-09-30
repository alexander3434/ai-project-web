# Review — method B (skeleton→body harness)

Reviewer scope: frontend `src/` on branch `harness-experiment` of `/Users/murkka/Work/ai-turbo-web`,
produced by the two-agent pipeline (skeleton → body), against `docs/features/react-chat-web/spec.md`
(FR-01…FR-08, NFR-01/NFR-07, design decisions, plan T-11…T-19), `CODE_STYLE.md`, `CLAUDE.md`.

## Verdict: CHANGES REQUESTED

- Verdict: CHANGES REQUESTED
- Findings: 8, numbered below, each `[blk/maj/min/nit] file:line — description` (fix + rationale inline)
- Counts: blockers=0, majors=1, minors=2, nits=5
- Bug count: 2 (correctness findings only: F-1 major + F-2 minor; test-coverage/style/doc findings excluded)

## Compliance matrix

| Criterion | Status | Evidence |
|---|---|---|
| FR-01 scaffold/structure | PASS | `src/api/`, `src/components/`, `src/hooks/`, `src/types.ts`, `src/App.tsx` all present; typecheck/build/lint green |
| FR-02 components | PASS | `ChatWindow`, `MessageList`, `MessageBubble`, `ErrorBanner`, `ChatInput`, `ModelSelector` + 18 component tests |
| FR-03 localStorage | PASS* | key `ai-turbo-chat-history` (chatStorage.ts:6), tolerant `loadMessages`; *see F-1 (own blank entry is not filtered out on load) |
| FR-04 request mapping | PASS* | `isWireMessage` filter drops `error` entries (useChat.ts:107); *last message can be blank after a mid-turn reload (F-1) |
| FR-05 offline run | PASS* | 65/65 tests offline, no server started; *live M-06 walkthrough not run |
| FR-06 model selector | PASS | `local`/`deepseek`, default `deepseek`, per-request `model` field; App.test.tsx:134-146 |
| FR-07 error handling | PASS* | placeholder discarded, error banner, history kept, input re-enabled (App.test.tsx:104-132); *post-reload dead end (F-1) |
| FR-08 API base URL / no secrets | PASS* | `VITE_API_BASE_URL` constant + inherited dev-proxy; no `sk-`/secrets found; *value itself untested (F-3) |
| FR-20 restore + continue | PASS* | load/save covered by chatStorage.test.ts:9 tests; *live continuation is M-06 |
| NFR-01 tests offline/mocked | PASS | 8 files / 65 tests, mocked `fetch` or `vi.mock('../api/chatApi')` |
| NFR-07 browsers/API usage | PASS | no non-standard APIs; `crypto.randomUUID`, `fetch`+`ReadableStream`, `localStorage`; live matrix is M-06 |
| T-11 scaffold | PASS | config inherited from method A commit, unchanged |
| T-12 types + sse parser | PASS | `types.ts` exports exactly `MessageRole`/`MessageKind`/`ChatMessage`/`ModelChoice`; sse.test.ts 14 cases (split frames, held CR, multi-`data:`, comments) |
| T-13 chatApi | PASS* | streamChat POST/ok/SSE/error branches tested (9 cases); *F-3 API_BASE_URL value uncovered |
| T-14 chatStorage | PASS | 9 cases incl. corrupt JSON, non-array, invalid entries |
| T-15 useChat | PASS* | 11 cases (send, abort, error, model); *F-1 |
| T-16 components | PASS | MessageList/ChatWindow 8 cases incl. scroll rules |
| T-17 input/selector | PASS* | 10 cases; *F-2 focus under streaming |
| T-18 App shell | PASS | 4 cases (happy path, error path, model) |
| T-19 gates | PASS* | typecheck/test/build/lint all green; *evidence docs have stale counts (see Scope check) |

## Findings

1. [maj] `/Users/murkka/Work/ai-turbo-web/src/hooks/useChat.ts:88` (+ `:111,114`; `/Users/murkka/Work/ai-turbo-web/src/hooks/chatStorage.ts:26-34`) — the in-flight assistant placeholder (empty at start, partial while streaming) is persisted on every `messages` change, so a reload during a turn restores it; on the next send it is neither re-sent as a valid assistant turn nor filtered (only `kind: 'error'` is dropped at useChat.ts:107) and is sent with blank `content`, which the backend rejects (`ChatRequestValidator.kt`: `Field 'messages[i].content' must not be blank`, HTTP 400). Every subsequent send then fails the same way, and D-17 leaves no clear-history control, so the conversation is permanently stuck (recovery only via devtools). A non-blank partial answer is silently replayed as a complete assistant turn, which D-13 explicitly wanted to avoid. Suggested fix: in `loadMessages`, drop entries whose `content.trim()` is empty (or, additionally, do not persist while `isStreaming` and persist the settled answer on resolve), plus a regression test "reload during a turn leaves a usable conversation". This deviates from the recorded design literally, but the outcome is a dead end the design did not intend.
2. [min] `/Users/murkka/Work/ai-turbo-web/src/components/ChatInput.tsx:69` (+ `:53`) — "focus is kept after send" (T-17) is not met in the live app: `disabled={isStreaming}` blurs the field on the next render, so the synchronous `focus()` at line 53 is undone; ChatInput.test.tsx:29 only asserts focus with `isStreaming={false}` and never exercises the true transition. Suggested fix: refocus the input on the `isStreaming` true→false edge (or on `isStreaming === false` change) and add a test that rerenders through the streaming state.
3. [min] `/Users/murkka/Work/ai-turbo-web/src/api/chatApi.test.ts:53` — T-13's bullet on `API_BASE_URL` is unverified: the test only interpolates the constant into the expected URL, so neither the dev `''` branch nor `VITE_API_BASE_URL`/prod default is asserted. Suggested fix: unit-test the constant's resolution (e.g. `vi.stubEnv`) or explicitly mark this bullet as checked by build config review.
4. [nit] `/Users/murkka/Work/ai-turbo-web/src/components/MessageList.tsx:34` (same wording in `ChatWindow.tsx`, `MessageBubble.tsx`, `ErrorBanner.tsx`, `ChatInput.tsx`, `ModelSelector.tsx`, `App.tsx`; `/Users/murkka/Work/ai-turbo-web/src/index.css:4`) — KDocs still say "в скелете — без разметки" / "В скелете — только имена классов", which is false in the final code and leaks harness vocabulary into the product. Suggested fix: drop the skeleton clause (keep the rest of the comment).
5. [nit] `/Users/murkka/Work/ai-turbo-web/src/hooks/useChat.ts:9` — the header says `DEFAULT_MODEL` comes from `api/chatApi.ts`, but it is defined locally (useChat.ts:31) and `chatApi.ts` does not export it. Suggested fix: correct the comment.
6. [nit] `/Users/murkka/Work/ai-turbo-web/src/hooks/useChat.ts:31` and `/Users/murkka/Work/ai-turbo-web/src/components/ModelSelector.tsx:26` — `DEFAULT_MODEL` and `MODEL_SELECT_ID` are exported but have no external consumer. Suggested fix: make them module-local until needed.
7. [nit] `/Users/murkka/Work/ai-turbo-web/src/hooks/useChat.ts:84,111` — `abortRef` is never cleared after the request settles; a stale controller lingers (calling `abort()` on it is a no-op, so harmless). Suggested fix: null it in a `finally`.
8. [nit] `/Users/murkka/Work/ai-turbo-web/src/components/MessageList.test.tsx:22`, `/Users/murkka/Work/ai-turbo-web/src/App.test.tsx:51` — tests assign `Element.prototype.scrollIntoView` and never restore it. Suggested fix: save the original in `beforeAll`/restore in `afterAll`, or use `vi.spyOn` with `restoreAllMocks`.

## Scope check

- `git diff 0c13162..HEAD` is **empty** — HEAD *is* `0c13162`; the method-B deliverable is the untracked working-tree `src/` (23 files), which is what this review covers. `git status` shows only: modified `docs/features/react-chat-web/06-implementation-record.md` (backend web-search section, unrelated to this frontend src), untracked `.claude/agents/developer-skeleton.md`, `.claude/agents/developer-body.md` (harness artifacts), and untracked `src/`.
- All 23 `src/` paths sit exactly in the plan's file inventory (T-11…T-18); no stray modules, no dead files, no duplicate implementations (`src/` vs method A's committed tree: all 23 files differ — this is a genuine re-implementation).
- Unrelated change present in the working tree: `06-implementation-record.md` §8 (backend `web_search` in the ai-project repo) — out of scope for this review.
- Evidence-artifact mismatch: `04-test-report.md` and `06-implementation-record.md` still describe the pre-reset `src/` (8 files / 59 tests), while the reviewed `src/` runs 65 tests. If method B's `src/` is kept, those records must be regenerated/re-pointed before they can be cited as evidence.

## Checks run

- `npm run typecheck` — exit 0, no diagnostics.
- `npm run test` — 8 files passed (8), tests passed 65 (65), 0 failed/skipped, ~2.0 s, fully offline; no server started.
- `npm run build` — exit 0 (`tsc -b && vite build`, built successfully).
- `npm run lint` (oxlint) — exit 0.
- Greps: no `any`, no `dangerouslySetInnerHTML`, no `NotImplementedError`/`undefined as never`/stub `return null` leftovers, no `.only`/`.skip`, no secrets/keys.

## Out of scope

- Backend repo (ai-project), Kotlin/Ktor code and its record sections — different repository.
- `.gitignore` missing `.env` (pre-existing, unchanged file; already reported as method-A n-2).
- M-06 manual E2E: live API run, NFR-05 latency, NFR-07 browser matrix, `curl -N` flush check and Vite-proxy buffering — not run (no servers).

## Notes on skeleton→body fidelity

- Signatures: no stub marker remains anywhere (grep clean), and every public shape matches the plan inventory. Components/App keep the skeleton's `ReactElement | null` return annotations (finding 6 is cosmetic only).
- Comments followed: the skeleton's KDoc headers are preserved essentially verbatim, including now-false skeleton references (finding 4) — strong evidence the body agent edited bodies, not contracts. One comment contradicts the code (`DEFAULT_MODEL` location, finding 5).
- Deviations found: none in the export surface or prop types; the only substantive deviation is behavioral (finding 1: placeholder persistence) — it follows the design literally yet breaks the conversation after a mid-turn reload.
- Unverifiable claim: "the export list is byte-identical to the skeleton" cannot be checked from git — the skeleton was never committed, and no stash/reflog/branch/commit contains it (`git log -S'NotImplementedError' -- src/` is empty). Fidelity is therefore assessed structurally (stub markers gone, shapes and comments retained), not byte-wise.
- Tests added by the body agent (65, vs. 59 cited in the method-A record) are all offline and in-scope for the body-agent brief; quality is good overall (real user-event interactions, assertion on request payloads, error paths), with the gaps noted in findings 1-3.
