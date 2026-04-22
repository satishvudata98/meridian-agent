# Lambda Functions and Internal Logic

This document explains the internal workflow, inputs, outputs, and logic for each serverless AWS Lambda function in the application, along with shared business logic.

## 1. Agent Trigger Function (`lambdas/api/trigger.py`)
*   **Responsibility**: The entry point for starting a new AI research task.
*   **Inputs**: HTTP POST request with a JSON body containing `{"topic_name": "..."}`.
*   **Internal Flow**:
    1.  Handles CORS preflight requests (`OPTIONS`).
    2.  Parses the HTTP payload.
    3.  Generates a unique `run_id` (UUID).
    4.  Constructs a payload `{"topic_name": "...", "run_id": "..."}`.
    5.  Uses the `boto3` SQS client to send the payload to the `AgentRunQueue`.
*   **Outputs**: HTTP 200 OK with `{"run_id": "...", "status": "queued"}`.
*   **Integrations**: API Gateway (Function URL), SQS.

## 2. Agent Orchestrator Function (`lambdas/orchestrator/handler.py`)
*   **Responsibility**: The "Brain". Orchestrates the interaction between the LLM and the Tool System.
*   **Inputs**: SQS Event containing the queue payload (`topic_name`, `run_id`).
*   **Internal Flow**:
    1.  Extracts the SQS record.
    2.  Initializes the `BedrockClient` or `OpenAIClient` (via `llm_factory.py`) and the `ToolExecutor`.
    3.  Adds metadata annotations (`run_id`) to the AWS X-Ray recorder.
    4.  Starts a `while/for` loop (max 10 iterations) to run the ReAct (Reasoning and Acting) logic.
    5.  Constructs a prompt with `messages` and passes `TOOL_SCHEMAS`.
    6.  Evaluates the LLM's `stop_reason`.
    7.  If `tool_use` is returned, it parses the requested tool name and inputs, passes them to `ToolExecutor.execute()`, and appends the result to the `messages` array.
    8.  If the LLM calls the specific `create_digest` tool, the research is deemed complete and the loop breaks.
*   **Outputs**: Returns `{"statusCode": 200, "body": "Success"}` to SQS, signaling the message can be deleted from the queue.
*   **Integrations**: SQS (Input), AWS X-Ray (Tracing), DynamoDB (via `create_digest`), Bedrock/OpenAI, External Web APIs (Tavily).

## 3. WebSocket Manager Function (`lambdas/websocket/handler.py`)
*   **Responsibility**: Manages the state of real-time WebSocket connections.
*   **Inputs**: API Gateway WebSocket events (`$connect`, `$disconnect`, `$default`).
*   **Internal Flow**:
    1.  Extracts the `connectionId` and `routeKey` from the event context.
    2.  On `$connect`: Extracts the `runId` from the URL query parameters. Saves a mapping of `connection_id` -> `run_id` to the `AgentConnections` DynamoDB table.
    3.  On `$disconnect`: Deletes the `connection_id` record from DynamoDB to prevent memory leaks and dead connections.
*   **Outputs**: HTTP 200 OK to API Gateway.
*   **Integrations**: API Gateway (WebSocket), DynamoDB.

## 4. Get Digests Function (`lambdas/api/get_digests.py`)
*   **Responsibility**: Serves the completed research reports to the frontend.
*   **Inputs**: HTTP GET request.
*   **Internal Flow**:
    1.  Handles CORS preflight requests.
    2.  Executes a `scan()` operation on the `ResearchDigests` DynamoDB table.
    3.  Sorts the returned items in memory by `created_at` (descending).
    4.  Limits the return to the top 10 most recent digests.
    5.  Uses a custom `DecimalEncoder` to safely parse DynamoDB `Decimal` types into standard JSON floats/ints.
*   **Outputs**: HTTP 200 OK with a JSON array of digests.
*   **Integrations**: API Gateway (Function URL), DynamoDB.

## 5. Cost Guardrail Function (`lambdas/guardrail/handler.py`)
*   **Responsibility**: Prevents runaway LLM costs by monitoring daily spend.
*   **Inputs**: Empty scheduled event from AWS EventBridge.
*   **Internal Flow**:
    1.  Uses `boto3` CloudWatch client to `get_metric_statistics()`.
    2.  Queries the custom namespace `Meridian/Agent` for the `AgentRunCost` metric over the last 24 hours (`Period=86400`).
    3.  Compares the returned sum against the `DAILY_SPEND_LIMIT_USD` environment variable.
    4.  If the limit is breached, it constructs an alert message and uses the `boto3` SNS client to `publish()` it to the configured topic.
*   **Outputs**: Returns a JSON status object to CloudWatch logs.
*   **Integrations**: EventBridge (Trigger), CloudWatch (Metrics), SNS (Alerting).

## 6. Shared Business Logic (`backend/shared/`)

### 6.1 Tool Executor (`tool_executor.py`)
A dispatch router that implements the logic defined in `tool_schemas.py`.
*   `_web_search`: Wraps the Tavily API client to return JSON search results.
*   `_create_digest`: Generates a `digest_id`, captures the current UTC timestamp, and runs a DynamoDB `put_item` operation to save the final LLM findings.
*   `_save_to_memory` / `_search_memory`: Uses the LLM client to generate Amazon Titan Vector Embeddings and interacts with the memory datastore.

### 6.2 Rate Limiter (`rate_limiter.py`)
*   Implements a highly efficient **Sliding Window** rate limit algorithm using Redis.
*   **Logic**: Uses a Redis Transaction Pipeline (`pipeline.execute()`) to atomically:
    1. Remove expired timestamps from a Sorted Set (`zremrangebyscore`).
    2. Add the current Unix timestamp (`zadd`).
    3. Count the remaining elements (`zcard`).
    4. Apply a TTL expiration to automatically clear cache memory (`expire`).
*   **Usage**: Protects third-party API quotas (like Tavily) from being exhausted by overly aggressive agents.

### 6.3 LLM Clients (`bedrock_client.py` / `llm_factory.py`)
*   `llm_factory.py` provides an abstraction layer allowing the Orchestrator to swap between OpenAI and Anthropic Bedrock seamlessly using the `LLM_PROVIDER` environment variable.
*   `bedrock_client.py` implements the specific `invoke_model` API payloads for Amazon Bedrock, mapping Anthropic Haiku (for fast tool routing) and Sonnet (for complex synthesis), as well as Amazon Titan (for embeddings).
