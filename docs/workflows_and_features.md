# Workflows and Features

This document provides a detailed breakdown of the key features of the application and the specific step-by-step workflow of data through the system.

## 1. Feature-Level Breakdown

### 1.1 Autonomous AI Research
*   **What it does**: Takes a user-provided topic, autonomously queries the internet, reads webpages, synthesizes the information into a structured digest, and saves it. It operates without human intervention once triggered.
*   **AWS Services Involved**: API Gateway, Lambda, SQS, DynamoDB, Bedrock.
*   **End-to-End Implementation**: The frontend hits the `AgentTriggerFunction` which pushes a job to `AgentRunQueue`. The `AgentOrchestratorFunction` pulls the job and runs a ReAct (Reasoning and Acting) loop. It uses `tool_schemas.py` to understand its capabilities. When it needs to search the web, it calls the `web_search` tool (which wraps the external Tavily API). When it finishes, it calls the `create_digest` tool to save the results to DynamoDB.

### 1.2 Real-time Agent Monitoring (Scaffolded)
*   **What it does**: Allows a frontend UI (like a terminal window) to stream real-time logs of what the AI is currently "thinking" or "doing" (e.g., "Searching the web...", "Reading article...").
*   **AWS Services Involved**: API Gateway (WebSocket protocol), Lambda, DynamoDB.
*   **End-to-End Implementation**: A frontend establishes a WebSocket connection, passing the `run_id` as a query parameter. The `WebSocketManagerFunction` receives a `$connect` event and saves the mapping of the physical `connectionId` to the logical `run_id` in the `AgentConnections` DynamoDB table. While the Orchestrator Lambda is running the AI loop, it can query this table for any active `connectionId`s associated with its current `run_id` and use the API Gateway Management API to push live status updates to those specific clients.

### 1.3 Cost Protection Guardrail
*   **What it does**: Acts as a circuit breaker. Because autonomous agents can theoretically get stuck in infinite loops and burn expensive LLM credits, this feature monitors daily spend and alerts administrators if a safety threshold is crossed.
*   **AWS Services Involved**: EventBridge, Lambda, CloudWatch, SNS.
*   **End-to-End Implementation**: An EventBridge rule is configured with a cron expression (`rate(1 day)`) to trigger the `CostGuardrailFunction`. This Lambda queries CloudWatch for a custom metric (`AgentRunCost` within the `Meridian/Agent` namespace). If the sum exceeds `$5.00` (configurable via environment variable), the Lambda publishes an alert to an SNS topic, which sends an SMS or email to subscribed administrators.

## 2. Detailed Request Processing Workflow

The following outlines the precise, step-by-step lifecycle of a single user request.

### Stage 1: Request Initiation
1.  **User Action**: User types "Innovations in solid-state batteries" into the frontend UI and hits submit.
2.  **HTTP POST**: Frontend sends `{"topic_name": "Innovations in solid-state batteries"}` to the Trigger Lambda Function URL.
3.  **Acknowledge**: Trigger Lambda generates `run_123abc`.
4.  **Queue**: Trigger Lambda puts `{"topic_name": "Innovations in solid-state batteries", "run_id": "run_123abc"}` into the SQS `AgentRunQueue`.
5.  **Response**: Trigger Lambda returns HTTP 200 OK with `{"run_id": "run_123abc", "status": "queued"}` to the frontend.

### Stage 2: Processing (The AI Loop)
1.  **Invocation**: AWS SQS automatically invokes the Orchestrator Lambda, passing it the queued payload.
2.  **Setup**: Orchestrator initializes the LLM and the Tool System. It starts AWS X-Ray tracing.
3.  **Loop Step 1 (Reasoning)**: Orchestrator sends the initial system prompt and the user's topic to the LLM. 
4.  **Loop Step 1 (Action)**: The LLM responds indicating it wants to use the `web_search` tool. It returns a JSON object: `{"type": "tool_use", "name": "web_search", "input": {"query": "solid-state batteries innovations 2024"}}`.
5.  **Loop Step 1 (Execution)**: The Orchestrator intercepts this response, pauses the LLM, and calls `ToolExecutor._web_search()`. This function hits the Tavily API and returns a JSON string of search results.
6.  **Loop Step 2 (Reasoning)**: The Orchestrator appends the Tavily results to the message history and sends it *back* to the LLM.
7.  **Loop Step 2 (Action)**: The LLM analyzes the results. It decides it has enough information to fulfill the user's request. It returns a JSON object requesting the `create_digest` tool: `{"type": "tool_use", "name": "create_digest", "input": {"findings": ["Solid state batteries are...", "Companies like X are..."]}}`.

### Stage 3: Data Storage
1.  **Execution**: The Orchestrator intercepts the `create_digest` call and executes `ToolExecutor._create_digest()`.
2.  **Commit**: This function takes the array of findings, generates a unique `digest_id`, grabs the current UTC timestamp, and runs a `put_item` operation into the `ResearchDigests` DynamoDB table.
3.  **Termination**: The Orchestrator detects that the `create_digest` tool was called. It prints "Digest creation triggered. Loop complete" and gracefully exits the `while` loop. The Lambda function completes with a `200 Success`, signaling to SQS to permanently delete the original message from the queue.

### Stage 4: Response Retrieval
1.  **Polling/Refresh**: The user refreshes the frontend UI or clicks "View Recent Reports".
2.  **HTTP GET**: Frontend sends a request to the `GetDigestsFunction`.
3.  **Fetch**: The Lambda performs a `scan()` on the `ResearchDigests` table, sorts the results, and returns the top 10 reports, which now includes the newly created digest for "solid-state batteries".
