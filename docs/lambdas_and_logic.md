# Lambda Functions And Internal Logic

Last updated: 2026-04-22

This document explains the current backend Lambda handlers and shared Python modules.

## 1. API Lambdas

### 1.1 Agent Trigger Function

File: `backend/lambdas/api/trigger.py`

Responsibility: start a new research run.

Inputs:

- HTTP `POST` body: `{ "topic_name": "..." }`
- HTTP `OPTIONS` for CORS preflight

Flow:

1. Builds permissive CORS headers.
2. Returns `204` for `OPTIONS`.
3. Parses the JSON body.
4. Rejects requests without `topic_name`.
5. Generates a `run-{uuid}` ID.
6. Sends `{ "topic_name": "...", "run_id": "..." }` to `QUEUE_URL`.
7. Returns `{ "run_id": "...", "status": "queued" }`.

Integration: SQS through `AgentRunQueue`.

### 1.2 Get Digests Function

File: `backend/lambdas/api/get_digests.py`

Responsibility: provide the dashboard with completed digests and active HITL pauses.

Flow:

1. Handles CORS preflight.
2. Scans `ResearchDigests`.
3. Scans `AgentPausedState`.
4. Converts paused items with `status == "awaiting_input"` into dashboard-compatible cards.
5. Merges completed digests and paused cards.
6. Sorts by `created_at` descending.
7. Returns the top 20 items.

The function includes a `DecimalEncoder` so DynamoDB `Decimal` values serialize correctly.

## 2. Agent Execution Lambdas

### 2.1 Agent Orchestrator Function

File: `backend/lambdas/orchestrator/handler.py`

Responsibility: run the autonomous agent loop.

Inputs:

- SQS fresh-run message: `{ "topic_name": "...", "run_id": "..." }`
- SQS HITL resume message: `{ "type": "hitl_resume", "run_id": "...", "topic_name": "...", "human_answer": "...", "phase": "...", "pending_tool_use_id": "...", "messages": "..." }`

Flow:

1. Selects the LLM client through `get_llm_client()`.
2. Attempts to connect to PostgreSQL vector memory if `DB_HOST` is set.
3. Initializes `ToolExecutor` with the LLM, memory store, run ID, and message reference.
4. Adds X-Ray annotations for `topic_id` and `run_id`.
5. Defines a WebSocket publisher that queries `AgentConnections.RunConnectionsIdx`.
6. Starts or restores the conversation history.
7. Runs up to 25 steps across `planning`, `researching`, and `writing` phases.
8. Calls the LLM with the phase-specific system prompt and `TOOL_SCHEMAS`.
9. Executes tool calls through `ToolExecutor`.
10. Intercepts the first `create_digest` call as critic review when not yet in `writing`.
11. Exits cleanly on HITL pause by returning `status: awaiting_human_input`.
12. Marks completion once a writing-phase `create_digest` returns success.

Key behavior:

- The model is prodded if it tries to end before submitting a digest.
- The WebSocket stream emits thinking, tool-use, paused, and completed events.
- HITL resume reconstructs the pending `ask_human_guidance` call as a matching `tool_result` before calling the model again.
- Older paused records without `pending_tool_use_id` are handled by locating unanswered tool calls in the saved messages.

### 2.2 Code Executor Function

File: `backend/lambdas/code_executor/handler.py`

Responsibility: isolated Python execution for the `execute_code` tool.

Flow:

1. Accepts `{ "code": "...", "timeout": 15 }`.
2. Rejects code containing forbidden keywords such as `import os`, `subprocess`, `open(`, `eval(`, `requests`, `socket`, or `pip`.
3. Writes the code to a temporary `.py` file.
4. Runs it in a separate process with a timeout.
5. Captures stdout, stderr, execution time, and success status.
6. Truncates stdout above 4000 characters.
7. Returns JSON in the Lambda `body`.

This is a useful analysis sandbox, but it should still be treated as basic isolation rather than a hardened untrusted-code platform.

## 3. HITL Lambdas

### 3.1 HITL Resume Function

File: `backend/lambdas/hitl/resume.py`

Responsibility: accept a user's answer and resume a paused run.

Inputs:

- HTTP `POST` body: `{ "run_id": "...", "answer": "..." }`

Flow:

1. Validates `run_id` and non-empty answer.
2. Loads the paused state from `AgentPausedState`.
3. Returns `404` if no paused run exists.
4. Returns `409` if the run is not awaiting input.
5. Updates status to `resumed` to prevent double-submit.
6. Sends a `hitl_resume` message to SQS with saved messages, saved phase, pending tool-call ID, and the human answer.
7. Returns a success response to the UI.

### 3.2 HITL Timeout Function

File: `backend/lambdas/hitl/timeout.py`

Responsibility: resume stale paused runs automatically.

Trigger: EventBridge schedule every 30 minutes.

Flow:

1. Queries `AgentPausedState.StatusExpiresIdx` for `status == "awaiting_input"` and `expires_at < now`.
2. Marks each stale run as `timed_out`.
3. Sends a `hitl_resume` SQS message with the saved phase, pending tool-call ID, and a timeout instruction.
4. Returns the count of processed paused runs.

## 4. WebSocket Lambda

File: `backend/lambdas/websocket/handler.py`

Responsibility: manage WebSocket connection state.

Flow:

- `$connect`: reads `runId` from query params and stores `connection_id -> run_id` in `AgentConnections`.
- `$disconnect`: deletes the connection record.
- `$default`: returns a heartbeat success response.

The orchestrator later uses `RunConnectionsIdx` to broadcast run-specific events.

## 5. Guardrail Lambda

File: `backend/lambdas/guardrail/handler.py`

Responsibility: alert when daily agent spend exceeds a configured threshold.

Trigger: EventBridge schedule once per day.

Flow:

1. Reads `DAILY_SPEND_LIMIT_USD` and `ALARM_SNS_TOPIC_ARN`.
2. Gets the last 24 hours of `Meridian/Agent` `AgentRunCost` data from CloudWatch.
3. Publishes an SNS alert when the sum is greater than the threshold.
4. Returns status, cost, and breach flag.

Current caveat: this depends on `AgentRunCost` metrics being published. The helper exists, but the orchestrator does not currently call it.

## 6. Shared Modules

### 6.1 Tool Schemas

File: `backend/shared/tool_schemas.py`

Defines the LLM tool contract:

- `create_research_plan`
- `web_search`
- `summarise_url`
- `save_to_memory`
- `search_memory`
- `create_digest`
- `execute_code`
- `ask_human_guidance`

### 6.2 Tool Executor

File: `backend/shared/tool_executor.py`

Dispatches tool calls and implements the side effects:

- Tavily search
- simulated URL summary
- vector memory save/search
- DynamoDB digest writes
- code sandbox invocation
- HITL state persistence and WebSocket notification
- Stores the current agent phase and pending tool-call ID so manual and timeout resumes can continue with a valid tool-result message.


### 6.3 LLM Factory And Clients

Files:

- `backend/shared/llm_factory.py`
- `backend/shared/openai_client.py`
- `backend/shared/bedrock_client.py`

`LLM_PROVIDER` chooses between OpenAI and Bedrock. The OpenAI client converts the internal Anthropic-style content blocks into OpenAI chat-completion messages and maps OpenAI tool calls back to the orchestrator shape.

### 6.4 Memory Store

File: `backend/shared/memory_store.py`

Provides PostgreSQL pgvector support:

- creates the `vector` extension
- creates `memories`
- creates an IVFFlat cosine index
- inserts embedded memories
- runs similarity search by `topic_id`

### 6.5 Rate Limiter

File: `backend/shared/rate_limiter.py`

Implements Redis sorted-set sliding-window rate limiting. It is available for future API quota protection, but no current tool calls it.

### 6.6 Metrics Publisher

File: `backend/shared/metrics_publisher.py`

Publishes `AgentTokensUsed`, `AgentRunDuration`, `AgentRunCost`, and `AgentToolCallCount` to CloudWatch. It is instantiated in the orchestrator but not currently used to publish metrics.
