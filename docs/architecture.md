# System Architecture Overview

This document provides a comprehensive overview of the autonomous AI research agent application architecture, focusing on the end-to-end flow and component-level design.

## 1. High-Level Concept
The system uses an **Orchestrator Pattern** on a serverless event-driven AWS backend. It decouples rapid user-facing API interactions from the slower, computationally expensive AI execution loops using message queues.

## 2. End-to-End Application Flow

### 2.1 Deployment & Infrastructure Setup
*   **Infrastructure as Code (IaC)**: The system is deployed using AWS Serverless Application Model (SAM). The infrastructure is split modularly into `api.yaml`, `agent.yaml`, `data.yaml`, `memory.yaml`, and `observability.yaml`.
*   **Secrets Management**: API keys and database credentials are not hardcoded. They are dynamically resolved during deployment via AWS Systems Manager (SSM) Parameter Store using the `{{resolve:ssm:...}}` syntax.

### 2.2 Triggering Phase (Synchronous)
1.  **Request**: A client initiates an HTTP POST request to the API Gateway/Lambda Function URL (`AgentTriggerUrl`) with a JSON payload containing the `topic_name` (e.g., "Quantum Computing in 2025").
2.  **Acknowledgment**: The `AgentTriggerFunction` instantly generates a unique `run_id`, constructs an SQS message, and sends it to the `AgentRunQueue`. It returns a 200 OK to the client with the `run_id`. This non-blocking behavior prevents HTTP timeouts.

### 2.3 Execution Phase (Asynchronous)
1.  **Queue Polling**: The AWS Lambda service continually polls the `AgentRunQueue`. When a message arrives, it invokes the `AgentOrchestratorFunction`.
2.  **Agent Loop Initiation**: The Orchestrator sets up AWS X-Ray tracing for observability, initializes the LLM client (OpenAI or Anthropic Bedrock), and the `ToolExecutor`.
3.  **Autonomous Loop**: 
    *   The LLM receives a system prompt instructing it to research the topic.
    *   The Orchestrator loops (up to 10 iterations) calling the LLM. 
    *   If the LLM decides to use a tool (e.g., `web_search`), the Orchestrator pauses the LLM, executes the local Python logic for that tool (e.g., hitting the Tavily API), and appends the tool's output back to the conversation history.
    *   This ReAct (Reasoning and Acting) loop continues until the LLM decides it has satisfied the research requirements.

### 2.4 Storage & Completion
1.  **Finalization**: The LLM calls the `create_digest` tool.
2.  **Commit**: The `ToolExecutor` writes the structured findings into the `ResearchDigests` DynamoDB table.
3.  **Termination**: The orchestrator loop gracefully breaks, and the Lambda function execution succeeds, removing the message from the SQS queue.

## 3. Component-Level Breakdown

### 3.1 Asynchronous Queueing Layer (SQS)
*   **Responsibility**: Buffers incoming requests and ensures they are not lost if the backend is overwhelmed. 
*   **Trigger**: Written to by the Trigger Lambda, read by the Orchestrator Lambda.

### 3.2 Agent Orchestrator ("The Brain")
*   **Responsibility**: Coordinates the state machine of the AI. It handles the message history array, invokes the LLM, parses the `stop_reason`, and routes tool calls.
*   **Communication**: Communicates outbound to Foundation Models (Bedrock/OpenAI) and local tools.

### 3.3 The Tool System (`backend/shared`)
*   **Responsibility**: Gives the LLM physical capabilities.
*   `web_search`: Uses the Tavily Client for internet search.
*   `save_to_memory` / `search_memory`: Converts text to embeddings via Amazon Titan and interacts with the semantic database (RDS pgvector).
*   `summarise_url`: Intended for deep-dive HTML scraping.

### 3.4 Data & Caching Tier
*   **DynamoDB**: Stores JSON-like documents. Handles Connection IDs (for WebSockets), Topics, and final Digests.
*   **ElastiCache (Redis)**: Implements a sliding window rate limiter (`rate_limiter.py`) to protect external API quotas (e.g., Tavily API limits) by tracking requests in high-speed memory.
*   **RDS PostgreSQL**: Stores the heavy vector embeddings for long-term semantic memory retrieval.

### 3.5 Observability Layer
*   **Responsibility**: Tracing execution paths, monitoring health, and tracking costs. Uses CloudWatch for metrics and AWS X-Ray to visually track the execution time of the `run_agent_loop` and the external API calls it makes.
