# Operational Guide and Best Practices

This document outlines how to operate, monitor, and scale the application, detailing edge cases, error handling, and core AWS concepts developers need to master.

## 1. Edge Cases and Operational Considerations

### 1.1 Long-Running Agents and Timeouts
*   **The Problem**: AI generation is slow. A deep research task requiring multiple web searches and syntheses can easily exceed standard API timeouts (usually 30 seconds).
*   **The Mitigation**: The architecture uses an asynchronous SQS queue. The API Gateway returns immediately, while the backend Orchestrator Lambda is configured with a maximum `Timeout` of 900 seconds (15 minutes).
*   **Critical Setting**: The SQS `VisibilityTimeout` is *also* set to 900 seconds. If an Orchestrator Lambda picks up a message, SQS hides that message from other Lambdas for 15 minutes. If the Orchestrator crashes or times out before 15 minutes, the message becomes visible again, triggering an automatic retry. If `VisibilityTimeout` was shorter than the Lambda timeout, a second Lambda might pick up the same job while the first is still working on it, duplicating effort and costs.

### 1.2 "Poison Pill" Messages
*   **The Problem**: A user inputs a specific topic that causes the LLM to output malformed JSON, or causes a crash in the Python code. SQS will retry this message indefinitely, resulting in an infinite loop of crashes and high AWS bills.
*   **The Mitigation**: A Dead Letter Queue (DLQ). The `AgentRunQueue` is configured with a `RedrivePolicy` and `maxReceiveCount: 3`. If a message fails processing 3 times in a row, SQS automatically moves it to the `AgentRunDeadLetterQueue`. Engineers can then inspect this DLQ manually to debug the issue without affecting the live system.

### 1.3 Unbounded Costs (LLM Loops)
*   **The Problem**: An autonomous ReAct agent might get confused and loop endlessly between requesting tools and reading outputs without ever calling the `create_digest` exit tool.
*   **The Mitigation**:
    1.  **Code Level**: A hard limit of `max_steps = 10` is enforced in `orchestrator/handler.py`.
    2.  **Infrastructure Level**: The `CostGuardrailFunction` acts as a circuit breaker. It runs daily via EventBridge, checking CloudWatch for custom cost metrics. If daily spend exceeds the predefined threshold (e.g., $5.00), it fires a critical SNS alert to administrators.

### 1.4 Rate Limiting External APIs
*   **The Problem**: The `web_search` tool relies on the Tavily API, which has strict rate limits. If 100 users trigger agents simultaneously, Tavily will block the requests.
*   **The Mitigation**: The `RateLimiter` class (`backend/shared/rate_limiter.py`) implements a Sliding Window algorithm using Redis (ElastiCache). Before making an external API call, the Orchestrator checks the Redis cache. The sliding window guarantees that no more than `X` requests occur within a rolling `Y` second window, smoothly throttling the agents.

## 2. Error Handling and Retries
*   **API Gateway (Synchronous)**: The Trigger and Get Digests APIs wrap logic in `try/except` blocks and return HTTP 500 status codes with CORS headers if failures occur.
*   **SQS/Lambda (Asynchronous)**: If an exception is raised in the Orchestrator, the Lambda function fails. AWS Lambda automatically leaves the message in the SQS queue. SQS handles the retry logic based on the `VisibilityTimeout`.
*   **Third-Party APIs (Tavily/OpenAI)**: External calls inside the tool system must be wrapped in `try/except` blocks. If Tavily fails, the tool should return an error string *to the LLM* (e.g., `"Tool failed: Rate limit exceeded"`). The LLM can then intelligently decide to wait and try again, or try a different strategy, rather than crashing the whole Python script.

## 3. AWS Learning Guide (For Developers)

To confidently build, maintain, and scale this system, developers must master the following AWS concepts:

### 3.1 Identity and Access Management (IAM)
*   **Concept**: *Execution Roles*. Every Lambda function has an associated IAM Role. A Lambda can only access resources explicitly allowed by this role.
*   **Why it matters here**: If you add a new S3 bucket to save raw text files, the Orchestrator Lambda will fail with an `AccessDeniedException` until you update `agent.yaml` to include an `S3CrudPolicy` for that specific bucket.

### 3.2 DynamoDB Access Patterns
*   **Concept**: *Partition Keys and Global Secondary Indexes (GSIs)*. DynamoDB is not a relational database. You cannot run complex SQL `WHERE` queries easily.
*   **Why it matters here**: To get all connections for a specific run, you cannot just filter the main table. The `data.yaml` stack explicitly creates a `RunConnectionsIdx` GSI. You must query this index. Understanding GSIs is crucial for adding new features.

### 3.3 Serverless Application Model (SAM)
*   **Concept**: *Intrinsic Functions*. SAM uses YAML templates to define infrastructure.
*   **Why it matters here**: You must understand how to link resources dynamically. 
    *   `!Ref ResourceName` gets the ID of a resource.
    *   `!GetAtt ResourceName.Arn` gets the Amazon Resource Name.
    *   `!Sub "arn:aws:sqs:${AWS::Region}:${AWS::AccountId}:..."` allows string interpolation for building complex resource locators.

### 3.4 Distributed Tracing with AWS X-Ray
*   **Concept**: *Tracing across boundaries*. Standard logging is insufficient for serverless apps because a single request jumps across API Gateway, SQS, multiple Lambdas, and DynamoDB.
*   **Why it matters here**: The `orchestrator/handler.py` patches the `boto3` library (`patch_all()`). This means every time the agent talks to DynamoDB or Bedrock, X-Ray records the exact milliseconds it took. Furthermore, the code uses `xray_recorder.put_annotation("run_id", run_id)`. This allows developers to go to the AWS Console, type `annotation.run_id = "run_123"`, and instantly see the entire visual flowchart of what happened for that specific user request.
