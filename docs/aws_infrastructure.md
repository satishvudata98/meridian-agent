# AWS Infrastructure And Services

Last updated: 2026-04-22

The infrastructure is defined with AWS SAM and CloudFormation nested stacks under `infra/`. This document reflects the current templates, including newer networking, HITL, and code-execution resources.

## 1. Root Stack

File: `infra/template.yaml`

The root template composes six nested applications:

- `NetworkStack`: VPC, subnets, NAT, and security groups.
- `DataStack`: DynamoDB tables.
- `MemoryStack`: S3 raw-doc bucket, Redis cache, and PostgreSQL memory database.
- `ApiStack`: WebSocket API and WebSocket manager Lambda.
- `AgentStack`: SQS, orchestrator, trigger, digests, code executor, and HITL Lambdas.
- `ObservabilityStack`: cost alarm SNS topic, EventBridge schedule, and guardrail Lambda.

`AgentStack` depends on networking and memory so the orchestrator can run inside private subnets and reach RDS.

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
- `AgentPausedState`: keyed by `run_id`, with `StatusExpiresIdx` for timeout scans and TTL enabled on `ttl`.

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

- `HttpApi`: an HTTP API shell with permissive CORS. No current Lambda routes are attached in this template.
- `WebSocketApi`: API Gateway V2 WebSocket API named `AgentRunsWebSocket`.
- `WebSocketStage`: `prod`, auto-deploy enabled.
- `WebSocketManagerFunction`: handles `$connect`, `$disconnect`, and `$default`.
- WebSocket integration, routes, and Lambda invoke permission.

Outputs:

- `HttpApiUrl`
- `WebSocketApiUrl`

Important distinction: the dashboard's trigger, digest, and HITL resume calls currently use Lambda Function URLs created in `agent.yaml`, while this stack provides the WebSocket API used for live run traces.

## 6. Agent Stack

File: `infra/stacks/agent.yaml`

Queueing:

- `AgentRunQueue`: main SQS queue with `VisibilityTimeout: 900`.
- `AgentRunDeadLetterQueue`: DLQ.
- Redrive policy moves messages to the DLQ after 3 failed receives.

Functions:

- `AgentTriggerFunction`: Function URL, validates a topic and queues a fresh run.
- `AgentOrchestratorFunction`: SQS consumer, 900-second timeout, VPC-enabled, runs the agent loop.
- `GetDigestsFunction`: Function URL, returns completed digests plus active paused runs.
- `CodeExecutorFunction`: isolated Lambda for Python code execution.
- `HITLResumeFunction`: Function URL, accepts human answers and requeues paused runs.
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
- The WebSocket API has no custom authorizer in the current template.
- RDS is private and accepts PostgreSQL traffic only from the Lambda security group.
- The orchestrator runs in private subnets and uses NAT for outbound access to external services.
- The code executor Lambda intentionally has no VPC configuration and no application IAM permissions beyond logging.
- Secrets are injected using SSM dynamic references such as `{{resolve:ssm:OPENAI_API_KEY}}`, `{{resolve:ssm:TAVILY_API_KEY}}`, and `{{resolve:ssm:/agent/db_password}}`.

## 9. Cost Notes

This stack can incur non-trivial AWS charges because it provisions NAT Gateway, RDS, and ElastiCache Serverless Redis in addition to Lambda, SQS, DynamoDB, API Gateway, Bedrock/OpenAI usage, and CloudWatch. For development, tear down stacks that are not actively needed and keep the spend guardrail metric publishing connected before relying on the alarm.
