# System Architecture Overview

Last updated: 2026-04-22

This document describes the current Meridian Agent application as implemented in the repository. The app is a serverless research-agent system with a Next.js dashboard, AWS Lambda backend, SQS-based async execution, DynamoDB state, optional vector memory, WebSocket run streaming, code execution, and human-in-the-loop resume support.

## 1. Current System At A Glance

The application is organized as a monorepo:

- `frontend/`: Next.js 16 App Router dashboard built with React 19, Tailwind CSS, shadcn-style UI primitives, lucide-react icons, framer-motion, and ReactMarkdown.
- `backend/`: Python 3.12 Lambda handlers plus shared agent, LLM, memory, metrics, and tool code.
- `infra/`: AWS SAM nested stacks for networking, data, memory, API/WebSocket, agent compute, and observability.

The backend intentionally separates fast user-facing HTTP requests from slower autonomous research work. A topic trigger returns quickly after queueing a job, while the orchestrator Lambda consumes the job from SQS and performs the multi-step agent loop.

## 2. Runtime Request Flow

### 2.1 Fresh Research Run

1. A user enters a topic in the dashboard on `/`.
2. The frontend posts `{ "topic_name": "..." }` to `NEXT_PUBLIC_TRIGGER_URL`, which points to the `AgentTriggerFunction` Lambda Function URL.
3. `AgentTriggerFunction` validates the topic, generates a `run-{id}` value, and sends `{ "topic_name": "...", "run_id": "..." }` to `AgentRunQueue`.
4. The frontend redirects to `/runs/[run_id]`.
5. The run page opens a WebSocket connection to `NEXT_PUBLIC_WS_URL?runId=<run_id>`.
6. SQS invokes `AgentOrchestratorFunction` with the queued payload.
7. The orchestrator runs a phase-based ReAct loop and publishes live status events to all WebSocket connections registered for the run.
8. The final `create_digest` tool writes a structured digest to the `ResearchDigests` DynamoDB table.
9. The dashboard fetches recent items from `NEXT_PUBLIC_GET_DIGESTS_URL`, and `/digests/[digest_id]` renders the full report.

### 2.2 Human-In-The-Loop Resume Flow

1. During research, the agent may call `ask_human_guidance` when it encounters genuine ambiguity.
2. `ToolExecutor._ask_human_guidance()` writes a snapshot of the conversation to `AgentPausedState`, stores a 2-hour response deadline, and broadcasts a pause event over WebSocket.
3. The run page shows a guidance input. The dashboard also surfaces paused runs as "Awaiting Guidance" cards.
4. The user submits an answer to `NEXT_PUBLIC_HITL_RESUME_URL`.
5. `HITLResumeFunction` marks the paused state as resumed and sends a `hitl_resume` message back to `AgentRunQueue`.
6. The orchestrator restores the saved messages, appends the human answer, and continues the agent loop.
7. `HITLTimeoutFunction` runs every 30 minutes and auto-resumes stale paused runs after the 2-hour response window.

## 3. Agent Loop Design

The orchestrator in `backend/lambdas/orchestrator/handler.py` is no longer a simple single-phase summarizer. It now has three explicit phases:

- `planning`: the system prompt requires the model to call `create_research_plan` first.
- `researching`: the model can use research tools such as `web_search`, `summarise_url`, `save_to_memory`, `search_memory`, `execute_code`, and `ask_human_guidance`.
- `writing`: the first `create_digest` attempt outside the writing phase is intercepted as a critic review. The model must revise or confirm the digest and call `create_digest` again before final storage.

The loop has a hard step limit of 25. WebSocket events are published for thinking, tool use, HITL pauses, and completion. AWS X-Ray annotations are set for `topic_id` and `run_id`.

## 4. Component Breakdown

### Frontend Dashboard

- `/`: Topic trigger form, latest digest cards, paused HITL cards, links to traces and reports.
- `/runs/[run_id]`: Live runtime terminal over WebSocket plus HITL answer form when the agent pauses.
- `/digests/[digest_id]`: Full digest view with executive summary, markdown detailed analysis, confidence, timestamp, and citations.
- `useAgentRunStream`: WebSocket hook that appends JSON run events to the trace UI.

### HTTP And WebSocket Entry Points

The current SAM templates create Lambda Function URLs for the primary HTTP actions:

- `AgentTriggerFunctionUrl`: queue a new run.
- `GetDigestsFunctionUrl`: retrieve recent digests and active paused runs.
- `HITLResumeFunctionUrl`: submit human guidance and resume a paused run.

`infra/stacks/api.yaml` also defines an `AWS::Serverless::HttpApi`, but the current implemented trigger, digest, and HITL endpoints are exposed through Function URLs, not explicit HTTP API routes. The WebSocket API is fully defined through API Gateway V2 with `$connect`, `$disconnect`, and `$default` routes.

### Data And State

- `ResearchDigests`: final structured reports with `digest_id`, `run_id`, `topic_id`, executive summary, detailed analysis, citations, confidence, and `created_at`.
- `AgentConnections`: WebSocket `connection_id` to `run_id` mapping, with `RunConnectionsIdx` for broadcast lookup.
- `AgentPausedState`: HITL pause snapshots keyed by `run_id`, with a `StatusExpiresIdx` GSI and TTL cleanup.
- `AgentRuns` and `ResearchTopics`: provisioned tables for future run/topic management.
- PostgreSQL `memories` table: initialized by `MemoryStore` when `DB_HOST` is available, with pgvector embedding search.

### LLM Providers

`shared/llm_factory.py` selects the provider using `LLM_PROVIDER`.

- Default: `openai`, using `gpt-4o-mini`, `gpt-4o`, and `text-embedding-3-small`.
- Optional: `bedrock`, using Claude 3 Haiku, Claude Sonnet 4, and Amazon Titan Embeddings v2.

The orchestrator uses Anthropic-style message and tool blocks internally. The OpenAI client adapts those blocks to OpenAI chat completions and maps responses back into the orchestrator's expected shape.

### Tool System

`ToolExecutor` implements the advertised tool schemas:

- `create_research_plan`: acknowledges a plan and advances the workflow.
- `web_search`: calls Tavily search when configured.
- `summarise_url`: placeholder simulation, not a real fetch/scrape implementation yet.
- `save_to_memory` and `search_memory`: use embeddings plus PostgreSQL pgvector when memory is connected.
- `create_digest`: writes the final digest to DynamoDB.
- `execute_code`: invokes the isolated code executor Lambda when deployed, or a local subprocess fallback during local runs.
- `ask_human_guidance`: pauses the run, saves state, and broadcasts a HITL question.

## 5. Current Limitations To Keep Visible

- The `RateLimiter` class exists but is not currently wired into `web_search`.
- `MetricsPublisher` exists and the cost guardrail reads `AgentRunCost`, but the orchestrator does not currently publish run metrics.
- The S3 raw-document bucket is provisioned, but `summarise_url` does not yet fetch, parse, store, or summarize real HTML.
- Function URLs are configured with `AuthType: NONE`; production use should add authentication and authorization.
- The code sandbox has a basic blocklist and Lambda isolation, but it is not a full hardened container sandbox.
- The WebSocket stream currently sends operational events, not full model reasoning text.
