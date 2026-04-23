# AWS Infrastructure And Services

Last updated: 2026-04-23

The infrastructure is defined with AWS SAM and CloudFormation nested stacks under `infra/`. This document reflects the current templates, including newer networking, HITL, and code-execution resources.

## 1. Root Stack

File: `infra/template.yaml`

The root template composes six nested applications:

- `NetworkStack`: VPC, subnets, NAT, and security groups.
- `DataStack`: DynamoDB tables.
- `MemoryStack`: S3 raw-doc bucket, Redis cache, and PostgreSQL memory database.
- `ApiStack`: WebSocket API and WebSocket manager Lambda.
- `AgentStack`: HTTP API, SQS, orchestrator, trigger, digests, code executor, and HITL Lambdas.
- `ObservabilityStack`: cost alarm SNS topic, EventBridge schedule, and guardrail Lambda.

`AgentStack` depends on auth, networking, memory, and the WebSocket stack outputs so the HTTP API can validate JWTs, the orchestrator can run inside private subnets, and the orchestrator can publish live trace events.

## 2. Network Stack

File: `infra/stacks/network.yaml`

Resources:

- VPC with CIDR `10.0.0.0/16`.
- Two public subnets for internet/NAT infrastructure.
- Two private subnets for Lambda and RDS.
- Internet Gateway for public subnet egress.
- NAT Gateway with Elastic IP so private subnets can reach the internet.
- Lambda security group with outbound access.
- Database security group allowing PostgreSQL port 5432 only from the Lambda security group.

Exports:

- `AgentVpcId`
- `AgentPrivateSubnet1Id`
- `AgentPrivateSubnet2Id`
- `AgentLambdaSecurityGroupId`
- `AgentDatabaseSecurityGroupId`

## 3. Data Stack

File: `infra/stacks/data.yaml`

DynamoDB tables:

- `AgentRuns`: keyed by `run_id` and `created_at`, with `UserRunsIdx`.
- `ResearchTopics`: keyed by `topic_id`, with `UserTopicsIdx`.
- `ResearchDigests`: keyed by `digest_id`, with `TopicDigestsIdx`.
- `AgentConnections`: keyed by `connection_id`, with `RunConnectionsIdx` for WebSocket broadcast lookup.
- `AgentPausedState`: keyed by `run_id`, stores paused conversation state, phase, pending tool-call ID, question/context, with `StatusExpiresIdx` for timeout scans and TTL enabled on `ttl`.

Most tables use on-demand billing. PITR is enabled on run/topic/digest tables. HITL paused state uses TTL for cleanup.

## 4. Memory Stack

File: `infra/stacks/memory.yaml`

Resources:

- `RawDocumentBucket`: private S3 bucket named with account and region.
- `AgentRateLimitCache`: ElastiCache Serverless Redis for future rate limiting.
- `AgentDBSubnetGroup`: private subnet group for RDS.
- `AgentMemoryDB`: PostgreSQL 16.3 `db.t3.micro`, private, protected by the database security group.

Exports:

- `AgentDBEndpointAddress`
- `AgentDBName`

Current code use:

- The orchestrator consumes the RDS endpoint through `DB_HOST`.
- `MemoryStore.initialize_schema()` creates the pgvector schema at runtime.
- The raw document bucket and Redis cache are provisioned but not yet wired into active tool calls.

## 5. API Stack

File: `infra/stacks/api.yaml`

Resources:

- `WebSocketApi`: API Gateway V2 WebSocket API named `AgentRunsWebSocket`.
- `WebSocketStage`: `prod`, auto-deploy enabled.
- `WebSocketManagerFunction`: handles `$connect`, `$disconnect`, and `$default`.
- WebSocket integration, routes, and Lambda invoke permission.

Outputs:

- `WebSocketApiUrl`

This stack now owns only the WebSocket API used for live run traces. The authenticated HTTP API lives in `agent.yaml` so SAM can bind the Lambda `HttpApi` events to an `AWS::Serverless::HttpApi` in the same template.

## 6. Agent Stack

File: `infra/stacks/agent.yaml`

HTTP API:

- `HttpApi`: authenticated HTTP API shell with Cognito JWT authorizer.

Queueing:

- `AgentRunQueue`: main SQS queue with `VisibilityTimeout: 900`.
- `AgentRunDeadLetterQueue`: DLQ.
- Redrive policy moves messages to the DLQ after 3 failed receives.

Functions:

- `AgentTriggerFunction`: authenticated HTTP API target, validates a topic and queues a fresh run.
- `AgentOrchestratorFunction`: SQS consumer, 900-second timeout, VPC-enabled, runs the agent loop.
- `RunStreamTicketFunction`: authenticated HTTP API target that mints short-lived WebSocket stream tickets.
- `GetDigestsFunction`: authenticated HTTP API target, returns completed digests plus active paused runs.
- `CodeExecutorFunction`: isolated Lambda for Python code execution.
- `HITLResumeFunction`: authenticated HTTP API target that accepts human answers and requeues paused runs.
- `HITLTimeoutFunction`: EventBridge scheduled function that auto-resumes expired HITL pauses every 30 minutes.

Key orchestrator environment variables:

- `TAVILY_API_KEY`
- `OPENAI_API_KEY`
- `LLM_PROVIDER`
- `WS_API_ENDPOINT`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `CODE_EXECUTOR_ARN`
- `HITL_TABLE`

Outputs:

- `HttpApiUrl`
- `HttpApiId`
- `AgentRunQueueUrl`
- `AgentTriggerUrl`
- `GetDigestsUrl`
- `HITLResumeUrl`

## 7. Observability Stack

File: `infra/stacks/observability.yaml`

Resources:

- `CostAlarmTopic`: SNS topic for spend alerts.
- `CostGuardrailSchedule`: EventBridge rule running once per day.
- `CostGuardrailFunction`: reads CloudWatch `AgentRunCost` and publishes to SNS when above `DAILY_SPEND_LIMIT_USD`.

Current caveat: the `MetricsPublisher` helper must be called by the orchestrator before `AgentRunCost` has meaningful data.

## 8. Security And Access Notes

- Lambda Function URLs are currently configured as unauthenticated (`AuthType: NONE`).
- The primary frontend path now uses the authenticated HTTP API with a Cognito JWT authorizer.
- The WebSocket API has no custom authorizer in the current template, but the run page now requests a short-lived stream ticket before connecting.
- RDS is private and accepts PostgreSQL traffic only from the Lambda security group.
- The orchestrator runs in private subnets and uses NAT for outbound access to external services.
- The code executor Lambda intentionally has no VPC configuration and no application IAM permissions beyond logging.
- Secrets are injected using SSM dynamic references such as `{{resolve:ssm-secure:OPENAI_API_KEY}}`, `{{resolve:ssm-secure:TAVILY_API_KEY}}`, and `{{resolve:ssm-secure:/agent/db_password}}`.

## 9. Cost Notes

This stack can incur non-trivial AWS charges because it provisions NAT Gateway, RDS, and ElastiCache Serverless Redis in addition to Lambda, SQS, DynamoDB, API Gateway, Bedrock/OpenAI usage, and CloudWatch. For development, tear down stacks that are not actively needed and keep the spend guardrail metric publishing connected before relying on the alarm.
