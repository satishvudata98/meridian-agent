# AWS Infrastructure and Services

This document details the specific AWS services used in the application, their configuration, and how they connect to form the overall system.

## 1. CloudFormation Stack Breakdown

The infrastructure is defined using AWS Serverless Application Model (SAM) and split across five logical templates in `infra/stacks/`:

*   **`api.yaml`**: Provisions the API Gateway WebSocket infrastructure (`AgentRunsWebSocket`), routing (`$connect`, `$disconnect`, `$default`), and the `WebSocketManagerFunction` Lambda.
*   **`agent.yaml`**: Core processing layer. Provisions the `AgentRunQueue` (SQS), the `AgentRunDeadLetterQueue`, the `AgentTriggerFunction`, the `AgentOrchestratorFunction`, and the `GetDigestsFunction`.
*   **`data.yaml`**: DynamoDB configuration. Provisions `AgentRuns`, `ResearchTopics`, `ResearchDigests`, and `AgentConnections` tables, including their Global Secondary Indexes (GSIs).
*   **`memory.yaml`**: Long-term state and caching. Provisions an S3 Bucket for raw document archiving, a Serverless ElastiCache (Redis) instance for rate limiting, and an RDS PostgreSQL database for semantic vector storage.
*   **`observability.yaml`**: Cost control. Provisions an SNS Topic for cost alarms, an EventBridge cron schedule, and the `CostGuardrailFunction` Lambda.

## 2. AWS Service Roles and Configurations

### AWS Lambda (Compute)
*   **Role**: Executes all backend Python code serverlessly.
*   **Configuration**: Runs on `python3.12`. The Orchestrator has a high timeout of 900 seconds (15 mins) to accommodate slow LLM generations, and increased memory (`256MB`). Trigger/API lambdas use smaller memory footprints (`128MB`) and shorter timeouts (`15s-30s`).
*   **Permissions**: Uses strict IAM policies (e.g., `DynamoDBCrudPolicy`, `SQSSendMessagePolicy`, `bedrock:InvokeModel`) to adhere to the principle of least privilege.

### Amazon SQS (Decoupling & Queueing)
*   **Role**: Sits between the HTTP API and the Orchestrator, ensuring that a surge in user requests doesn't crash the LLM processes.
*   **Configuration**: `VisibilityTimeout` is set to 900 seconds to match the Orchestrator Lambda timeout. This ensures a message isn't picked up by a second Lambda while the first is still processing it.
*   **Dead Letter Queue (DLQ)**: If a message fails processing 3 times (`maxReceiveCount: 3`), it is automatically moved to `AgentRunDeadLetterQueue` to prevent infinite failure loops.

### Amazon DynamoDB (NoSQL Data)
*   **Role**: Fast, scalable storage for unstructured or semi-structured data.
*   **Configuration**: All tables use `PAY_PER_REQUEST` billing mode, which scales automatically to zero when idle and handles sudden bursts without manual capacity planning. Point-In-Time Recovery (PITR) is enabled for disaster recovery.

### Amazon API Gateway (WebSocket API)
*   **Role**: Maintains persistent TCP connections with frontend clients for real-time streaming updates.
*   **Configuration**: Uses route selection expression `$request.body.action`. It translates WebSocket native events into Lambda proxy events.

### Amazon Bedrock (AI Foundation Models)
*   **Role**: Provides managed access to industry-leading AI models via a single API.
*   **Capabilities Utilized**: 
    *   **Anthropic Claude 3 Haiku/Sonnet**: Used for the conversational ReAct loop and generating JSON tool calls.
    *   **Amazon Titan Embeddings v2**: Used for converting text chunks into 1536-dimensional vectors for semantic search.

### AWS EventBridge & SNS (Cost Guardrail)
*   **Role**: EventBridge acts as a cron scheduler triggering the Guardrail Lambda once a day. SNS handles the outbound notification dispatch (Email/SMS) if the Lambda detects a budget breach in CloudWatch metrics.

### AWS Systems Manager (SSM) Parameter Store
*   **Role**: Used in CloudFormation to securely inject secrets into environment variables at deploy time. Example: `OPENAI_API_KEY: "{{resolve:ssm:OPENAI_API_KEY}}"`. This keeps sensitive keys out of the Git repository.

### AWS X-Ray (Observability)
*   **Role**: Provides a visual map of the architecture and distributed tracing. The python backend patches the `boto3` library so every external API call to DynamoDB, SQS, or Bedrock is automatically timed and graphed in the AWS console. Annotations (`run_id`) are added to allow searching for a specific request's execution graph.
