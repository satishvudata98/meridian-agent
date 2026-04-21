# Autonomous AI Research & Monitoring Agent

## Goal Description
Build an Autonomous AI Research & Monitoring Agent — a production-grade system where an AI agent autonomously monitors user-defined topics, searches the web, synthesizes research, stores structured memory, and surfaces insights via a dashboard. The system runs on AWS Serverless infrastructure and uses Amazon Bedrock for LLM reasoning and summarization.

## User Review Required

> [!IMPORTANT]
> Please review this implementation plan carefully. Once you approve, I will generate the detailed `task.md` checklist and we can begin the Phase 1 development. 
> Ensure you are aware that running this in AWS will use some paid services (like AWS Bedrock, ElastiCache, and RDS if not on free tier), though the intention is to keep it under free limits as much as possible.

## Tech Stack Finalization

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui, deployed on AWS Amplify or Vercel.
- **Backend (Orchestration & APIs):** Python 3.12 Lambdas, API Gateway (HTTP & WebSocket), AWS SAM (Serverless Application Model).
- **AI / LLMs (Amazon Bedrock):** 
  - Claude 3 Haiku (for tool decisions & summarization)
  - Claude 3.5 Sonnet (for deep synthesis)
  - Titan Embeddings v2 (for vectorizing research)
- **Data & Storage:** 
  - DynamoDB (Agent runs, user configs, digests)
  - RDS PostgreSQL + `pgvector` (Semantic memory of past research)
  - ElastiCache Redis (Rate limiting Bedrock/Tavily API calls)
  - S3 (Raw document/HTML storage)
- **Async & Scheduling:** SQS (Decoupling API from Agent), EventBridge (Cron schedules).
- **Observability & Ops:** CloudWatch (Metrics/Dashboards), X-Ray (Tracing), SES (Email digests), Cost Guardrail Lambda (Alerts).
- **External Tools:** Tavily API (for web search).

---

## Required Manual AWS & Pre-requisite Steps (Must do before coding)

These manual setup steps must be performed in your AWS Console and third-party portals before or during our initial setup:

1. **Enable Bedrock Model Access:**
   - Go to AWS Console -> Amazon Bedrock -> Model Access.
   - Request access to **Anthropic Claude 3 Haiku**, **Anthropic Claude 3.5 Sonnet**, and **Amazon Titan Embeddings v2**. (This may take a few minutes to be approved).
2. **Verify SES Email Identity:**
   - Go to AWS Console -> Amazon Simple Email Service (SES).
   - Under "Verified Identities", add and verify the email address you will use to send and receive digest emails to avoid the SES sandbox block.
3. **Get Tavily API Key:**
   - Register at [Tavily](https://tavily.com/) and obtain an API Key for the web search tool.
4. **Local Environment Setup:**
   - Ensure AWS CLI ver. 2, AWS SAM CLI, Node.js 20, and Python 3.12 are installed.
   - Run `aws configure` and set up your local environment with an IAM User that has sufficient permissions (e.g., `AdministratorAccess` for the dev sandbox).

---

## Proposed Changes (Development Phases)

### Phase 1: Foundation (AWS Scaffold & APIs)
- Initialize a monorepo structure with AWS SAM (`/infra`, `/backend`, `/frontend`).
- Create SAM templates for DynamoDB tables (`agent_runs`, `topics`, `digests`) with Point-in-time Recovery.
- Set up API Gateway HTTP APIs with Cognito JWT Authorizer.
- Define HTTP API routes: `/topics`, `/runs`, `/runs/trigger`, `/digests` and a WebSocket route `/ws` for live streaming.
- Set up GitHub Actions CI/CD to deploy the SAM template automatically on merge.

### Phase 2: Agent Core (ReAct Loop & Bedrock Integration)
- Implement `BedrockClient` wrapper in Python for model routing (`fast_call` with Haiku, `deep_call` with Sonnet).
- Define Tool Schemas: `web_search`, `summarise_url`, `save_to_memory`, `search_memory`, `create_digest`.
- Build the **ReAct Orchestrator Lambda**: A loop (max 10 steps) that invokes Bedrock, interprets tool decisions, executes Python tool functions, and updates the WebSocket stream.
- Setup **SQS Integration**: API Gateway sends asynchronous triggers to SQS, and an SQS Consumer Lambda polls the queue to start the long-running Orchestrator.

### Phase 3: Memory and Data Layers
- Deploy AWS RDS (PostgreSQL t3.micro) via SAM and write migrations to enable `pgvector`.
- Implement `MemoryStore` in Python to save embedded text/sources and do cosine similarity vector search over past memories.
- Deploy AWS ElastiCache (Redis) via SAM and implement a sliding window `RateLimiter` to track and pause API requests if limits are reached.
- Configure S3 bucket for raw HTML file dumps and integrate it into the `summarise_url` tool to save artifacts.

### Phase 4: Frontend Dashboard & Notifications
- Bootstrap Next.js 14 App Router project with Tailwind CSS and `shadcn/ui`.
- Create `/topics` (configure crons) and `/` (grid of digest cards).
- Create `/runs/[run_id]` with a live log terminal reading from the API Gateway WebSocket (`useAgentRunStream`).
- Implement the EventBridge scheduler to trigger runs and the SES Notifier Lambda to send HTML email digests to users.

### Phase 5: MLOps, Observability, and Cost Guardrails
- Implement Python `MetricsPublisher` to log custom metrics (`AgentTokensUsed`, `AgentRunDuration`, `AgentRunCost`) to CloudWatch.
- Inject AWS X-Ray SDK to trace Latency across Lambdas, Bedrock invocations, and PG queries.
- Build a daily **Cost Guardrail Lambda**: Triggered by EventBridge, queries CloudWatch cost metrics, and sends an SNS alert if spend exceeds a safety threshold (e.g., $5/day).

---

## Architecture Decisions Based on User Input

1. **AWS Region:** `us-east-1` (Ensures full access to Bedrock models).
2. **Frontend Hosting:** Vercel (It is free and provides optimal Next.js native support).
3. **Database Architecture:** Retaining AWS native services (AWS RDS PostgreSQL and ElastiCache). The costs associated with them running long-term (~$15-$20/month) fit within the $100 projected dev/test budget and showcase true enterprise MLOps architecture for your portfolio.

## Verification Plan

- **Automated Deployments:** A GitHub Actions workflow will validate the SAM template, run `pytest` on backend functions, and deploy the stack.
- **Manual End-to-End Test:** 
  1. Login via Cognito (Frontend).
  2. Create a topic schedule.
  3. Trigger a manual sync.
  4. Watch the live WebSocket logs run the ReAct reasoning loops on the dashboard.
  5. Receive an email digest and review custom logs and X-Ray traces in the AWS console.
