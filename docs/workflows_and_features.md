# Workflows And Features

Last updated: 2026-04-23

This document tracks the application features that are present in the current codebase and how data moves through them.

The current user flow is private by default: the frontend is gated by Cognito Hosted UI through the auth shell, and the HTTP API expects Cognito-backed authentication.

## 1. Implemented Feature Inventory

### 1.1 Topic Tracking And Run Creation

The dashboard lets a user enter a research topic and submit it. The frontend calls the authenticated HTTP API using `NEXT_PUBLIC_API_BASE_URL`, specifically `POST /runs`. The Lambda validates `topic_name`, derives the authenticated owner from JWT claims, generates a `run-{uuid}` identifier, queues the run in SQS, and returns `{ "run_id": "...", "status": "queued" }`.

### 1.2 Latest Insights Dashboard

The home page fetches the authenticated `GET /digests` API through `NEXT_PUBLIC_API_BASE_URL` on load. The response is currently a mixed list that may include completed research digests and active HITL pauses. Completed digests show confidence and link to the full report. Paused runs show an "Awaiting Guidance" badge and link to the run trace when a summary is available.

### 1.3 Live Runtime Trace

The `/runs/[run_id]` page first requests a short-lived stream ticket from `POST /runs/{run_id}/stream-ticket`, then opens a WebSocket connection to `NEXT_PUBLIC_WS_URL?runId=<run_id>&runAccessToken=<ticket>`. `WebSocketManagerFunction` stores the connection in DynamoDB. The orchestrator looks up connections by `run_id` and pushes events for thinking, tool use, HITL pause, and completion.

### 1.4 Plan-First Agent Reasoning

The orchestrator starts in a `planning` phase and requires the model to call `create_research_plan` before using other tools. This creates a lightweight plan-and-solve workflow instead of immediately reacting to search results.

### 1.5 Research Tools

The current tool list includes:

- Tavily web search through `web_search`.
- URL summarization placeholder through `summarise_url`.
- Vector memory save/search through PostgreSQL pgvector.
- Python calculation and analysis through `execute_code`.
- HITL pause through `ask_human_guidance`.
- Final report storage through `create_digest`.

### 1.6 Critic-Gated Digest Writing

The first `create_digest` attempt during the research phase is intercepted. The orchestrator switches to the `writing` phase and returns a critic-review message asking the model to check depth, contradictions, and citations. Only a later `create_digest` call in the writing phase actually writes to DynamoDB.

### 1.7 Human-In-The-Loop Guidance

If the agent needs a human decision, `ask_human_guidance` saves the run state to `AgentPausedState`, including the current phase and pending tool-call ID, broadcasts an awaiting-input event, and exits the Lambda cleanly. The run page can show the pause from either a live WebSocket event or persisted paused state returned by the authenticated digests API. The user submits an answer through the authenticated `POST /runs/{run_id}/resume` flow, which loads the saved state and requeues the run as `hitl_resume`.

### 1.8 HITL Timeout Auto-Resume

`HITLTimeoutFunction` runs every 30 minutes. It queries `AgentPausedState.StatusExpiresIdx` for paused runs whose 2-hour response window has expired, marks them timed out, and requeues them with an instruction to proceed using best judgment.

### 1.9 Full Digest Rendering

The `/digests/[digest_id]` route currently fetches the authenticated digest list, selects the requested digest client-side, and renders:

- topic title
- confidence score
- created timestamp
- executive summary
- markdown detailed analysis
- citations as outbound links

### 1.10 Cost Guardrail

`CostGuardrailFunction` runs daily from EventBridge, checks the CloudWatch `Meridian/Agent` `AgentRunCost` metric, and publishes an SNS alert when daily spend exceeds `DAILY_SPEND_LIMIT_USD`.

Important: the metric publishing helper exists, but the orchestrator does not currently call it. The guardrail will only be meaningful after `AgentRunCost` is actually published.

## 2. Fresh Run Workflow

1. User submits a topic on `/`.
2. Frontend posts `{ "topic_name": "..." }` to the authenticated `POST /runs` endpoint.
3. Trigger Lambda returns a `run_id` and sends the job to SQS.
4. Frontend navigates to `/runs/[run_id]`.
5. The run page requests a short-lived stream ticket and then connects to WebSocket with the run ID and ticket.
6. SQS invokes the orchestrator Lambda.
7. Orchestrator initializes the LLM provider, optional MemoryStore, ToolExecutor, and X-Ray annotations.
8. The model calls `create_research_plan`.
9. The agent enters research mode and uses tools as needed.
10. The first digest attempt is converted into a critic review.
11. The final digest attempt writes to `ResearchDigests`.
12. Completion is broadcast over WebSocket.
13. The dashboard shows the completed digest on its next fetch.

## 3. HITL Workflow

1. The model calls `ask_human_guidance` with a question and context.
2. The tool stores `run_id`, `topic_name`, `phase`, `pending_tool_use_id`, question, context, status, expiry times, TTL, and serialized messages in `AgentPausedState`.
3. A WebSocket `awaiting_human_input` event is emitted.
4. The frontend displays the HITL answer card on `/runs/[run_id]`. If the user returns later, the page fetches persisted paused state through the authenticated `GET /digests` response.
5. The dashboard also includes the paused run in latest insights.
6. The user posts an answer through the authenticated `POST /runs/{run_id}/resume` endpoint.
7. `HITLResumeFunction` marks the paused run as resumed and queues a `hitl_resume` message with the saved phase and pending tool-call ID.
8. The orchestrator restores the message history, appends the human answer as the matching `tool_result`, restores the phase, and continues.
9. If the user never answers, the timeout Lambda auto-resumes the run after the response window expires.

## 4. Code Execution Workflow

The `execute_code` tool supports numerical analysis inside a research run.

- In AWS, `ToolExecutor` invokes `CodeExecutorFunction` using `CODE_EXECUTOR_ARN`.
- The code executor rejects obvious dangerous keywords, runs the code in a separate Python process with a timeout, captures stdout/stderr, truncates large output, and returns JSON.
- In local mode without `CODE_EXECUTOR_ARN`, the tool runs a local subprocess fallback with a smaller security check.

The tool requires the model to use `print()` because only stdout is returned as useful output.

## 5. Memory Workflow

When `DB_HOST` is configured, the orchestrator creates a `MemoryStore`, connects to PostgreSQL, and runs idempotent schema setup:

- enables the `vector` extension
- creates the `memories` table
- creates an IVFFlat cosine index

`save_to_memory` embeds content with the active LLM provider and stores it. `search_memory` embeds the query and performs vector similarity search scoped by `topic_id`.

## 6. Frontend Environment Variables

The dashboard expects these public environment variables:

- `NEXT_PUBLIC_API_BASE_URL`: authenticated HTTP API base URL.
- `NEXT_PUBLIC_WS_URL`: WebSocket API Gateway URL ending in `/prod`.
- `NEXT_PUBLIC_COGNITO_DOMAIN`: Cognito Hosted UI base URL.
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`: Cognito app client ID.
- `NEXT_PUBLIC_COGNITO_REDIRECT_URI`: frontend callback URL.
- `NEXT_PUBLIC_COGNITO_LOGOUT_URI`: frontend logout URL.
- `NEXT_PUBLIC_COGNITO_SCOPES`: usually `openid email profile`.

For deployed frontend hosts such as Vercel, `NEXT_PUBLIC_*` values are baked into the client bundle at build time. If any of them change, redeploy the frontend.

## 7. Feature Status Notes

- Frontend access is gated by Cognito Hosted UI.
- The HTTP API is the current frontend entry point for run creation, digest reads, resume actions, and stream-ticket issuance.
- Live run traces use short-lived stream tickets instead of direct anonymous WebSocket access.
- Real-time run traces are implemented as operational event streaming.
- HITL state save, manual resume, and timeout resume are implemented with valid tool-result reconstruction for OpenAI-style tool calls.
- Plan-first and critic-gated writing are implemented.
- Vector memory is implemented when PostgreSQL and pgvector are reachable.
- Code execution is implemented with basic controls.
- Digest detail and paused-state detail still rely on client-side filtering from the mixed `/digests` response rather than dedicated resource endpoints.
- URL summarization and S3 raw document archiving remain placeholders.
- Redis rate limiting is implemented as a class but not yet attached to Tavily calls.
- CloudWatch metrics publishing is implemented as a helper but not yet called by the orchestrator.
