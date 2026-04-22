# Operational Guide And Best Practices

Last updated: 2026-04-22

This guide covers setup, deployment, runtime checks, and operational risks for the current Meridian Agent app.

## 1. Required Configuration

### 1.1 AWS And Third-Party Prerequisites

- AWS account with permission to deploy SAM/CloudFormation stacks.
- AWS SAM CLI and AWS CLI configured locally.
- Node.js compatible with the Next.js frontend.
- Python 3.12 compatible build/deploy environment for Lambda dependencies.
- Tavily API key for web search.
- OpenAI API key if using the default `LLM_PROVIDER=openai`.
- Bedrock model access if switching `LLM_PROVIDER=bedrock`.

### 1.2 SSM Parameters

The SAM templates resolve these parameters during deployment:

- `TAVILY_API_KEY`
- `OPENAI_API_KEY`
- `/agent/db_password`
- `WS_API_ENDPOINT`

`WS_API_ENDPOINT` should be set to the deployed WebSocket URL, for example `wss://<api-id>.execute-api.<region>.amazonaws.com/prod`.

### 1.3 Frontend Environment

Set these variables for the Next.js app:

- `NEXT_PUBLIC_TRIGGER_URL`: `AgentTriggerUrl` stack output.
- `NEXT_PUBLIC_GET_DIGESTS_URL`: `GetDigestsUrl` stack output.
- `NEXT_PUBLIC_WS_URL`: `WebSocketApiUrl` stack output.
- `NEXT_PUBLIC_HITL_RESUME_URL`: `HITLResumeUrl` stack output.

## 2. Deployment Checklist

1. Configure AWS credentials.
2. Create required SSM parameters.
3. Deploy the SAM root template from `infra/template.yaml`.
4. Copy CloudFormation outputs into frontend environment variables.
5. Deploy or run the Next.js frontend.
6. Submit a topic from the dashboard.
7. Confirm the trigger Lambda returns a `run_id`.
8. Open `/runs/[run_id]` and confirm WebSocket connection status.
9. Wait for the orchestrator to produce a completion event or HITL pause.
10. Confirm completed reports appear on the dashboard and open in `/digests/[digest_id]`.

## 3. Local Frontend Development

From `frontend/`:

```bash
npm install
npm run dev
```

The frontend is useful locally when pointed at deployed AWS Lambda Function URLs and the deployed WebSocket API. Without those environment variables, the UI will load but cannot trigger real backend work.

## 4. Runtime Operations

### 4.1 Long-Running Agents

The orchestrator has a 900-second Lambda timeout, and `AgentRunQueue` uses a 900-second visibility timeout. This keeps one long-running agent from being picked up by a second Lambda while it is still processing.

The code-level agent loop limit is 25 steps. If the model tries to finish before calling `create_digest`, the orchestrator adds a prompt telling it to submit a final digest or ask for human guidance.

### 4.2 Failed Orchestrator Runs

If the orchestrator raises an exception, Lambda reports the SQS batch as failed. SQS retries the message. After 3 failed receives, the message moves to `AgentRunDeadLetterQueue`.

Operational response:

- Inspect CloudWatch logs for `AgentOrchestratorFunction`.
- Inspect the DLQ payload.
- Check external dependencies: OpenAI/Bedrock credentials, Tavily key, RDS connectivity, VPC/NAT egress, and DynamoDB permissions.

### 4.3 Human-In-The-Loop Pauses

Paused state is stored in `AgentPausedState`. The expected statuses are:

- `awaiting_input`
- `resumed`
- `timed_out`

The user has a 2-hour response window. `HITLTimeoutFunction` runs every 30 minutes and resumes stale pauses automatically. TTL is enabled for table hygiene using the `ttl` attribute.

Each pause record also stores the current phase and the pending `ask_human_guidance` tool-call ID. Manual and timeout resumes use that ID to append the human answer as the matching `tool_result`, which keeps OpenAI-style tool-call history valid after the Lambda has exited.

### 4.4 WebSocket Streaming

The run trace depends on three pieces:

- the frontend connects to `NEXT_PUBLIC_WS_URL?runId=<run_id>`
- `$connect` stores the mapping in `AgentConnections`
- the orchestrator has `WS_API_ENDPOINT` and `execute-api:ManageConnections` permission

If traces do not appear, check the WebSocket manager logs, `AgentConnections`, and the orchestrator logs for broadcast errors.

### 4.5 Vector Memory

Memory is optional at runtime. If `DB_HOST` is missing or PostgreSQL is unreachable, the orchestrator logs a warning and continues without memory.

If memory tools fail:

- verify RDS is deployed and healthy
- verify the Lambda private subnet routing through NAT if external API calls are also failing
- verify the database security group allows inbound 5432 from the Lambda security group
- verify `/agent/db_password`
- verify pgvector can be created in the database

### 4.6 Code Execution

The deployed `execute_code` tool invokes `CodeExecutorFunction`. The sandbox blocks common dangerous keywords and enforces a timeout, but it is not a fully hardened isolation boundary. Keep it for controlled analytical snippets, not arbitrary user-submitted code.

Good use cases:

- percentage changes
- ranking and aggregation
- parsing small JSON examples
- statistics from research data

Avoid:

- network access
- filesystem access
- package installation
- long-running computation

### 4.7 Cost Guardrail

`CostGuardrailFunction` checks CloudWatch daily. It only works if `AgentRunCost` metrics exist in the `Meridian/Agent` namespace. The repository currently has a `MetricsPublisher` helper, but the orchestrator does not publish metrics yet.

Until metrics are wired in, use AWS Billing, CloudWatch Logs, and provider dashboards to monitor spend.

## 5. Known Gaps And Follow-Up Work

- Add auth to Function URLs and WebSocket connections before production use.
- Wire `RateLimiter` into Tavily and any other external APIs.
- Call `MetricsPublisher.publish_run_metrics()` from the orchestrator with real token, duration, cost, and tool-call data.
- Replace `summarise_url` simulation with real fetch, parse, S3 archive, and summary logic.
- Add dedicated API routes if moving away from Lambda Function URLs to the provisioned `HttpApi`.
- Add backend unit tests for tool execution, HITL resume, timeout behavior, and OpenAI/Bedrock response mapping.
- Add frontend tests for dashboard, run trace, digest view, and HITL submission.

## 6. Troubleshooting Quick Reference

- Topic submit fails: check `NEXT_PUBLIC_TRIGGER_URL`, trigger Lambda logs, and SQS permissions.
- Run page disconnects: check `NEXT_PUBLIC_WS_URL`, WebSocket stage URL, and `$connect` logs.
- No trace events: check `WS_API_ENDPOINT`, `AgentConnections`, and `execute-api:ManageConnections`.
- No digests appear: check `ResearchDigests`, `NEXT_PUBLIC_GET_DIGESTS_URL`, and get-digests logs.
- HITL submit fails: check `NEXT_PUBLIC_HITL_RESUME_URL`, paused state status, and `QUEUE_URL`.
- Memory unavailable: check RDS endpoint, VPC security groups, pgvector, and DB credentials.
- Search fails: check `TAVILY_API_KEY` and Lambda internet egress through NAT.
- Model calls fail: check `LLM_PROVIDER`, provider API key, Bedrock access, and CloudWatch logs.
