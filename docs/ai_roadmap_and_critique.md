# AI Critique And Roadmap

Last updated: 2026-04-22

This document replaces the older critique that described the project as a basic summarizer on top of strong infrastructure. The current codebase has added several higher-value agent capabilities, but there are still important gaps before the system feels production-grade.

## 1. Current AI Capability Assessment

The application now demonstrates more than a basic web-search summary loop. The strongest implemented AI features are:

- Plan-first execution through the required `create_research_plan` tool.
- Phase-aware orchestration across planning, researching, and writing.
- Critic-gated digest submission, where the first digest attempt is intercepted for review.
- Structured digest output with executive summary, detailed markdown analysis, citations, and confidence.
- Vector memory save/search through embeddings and PostgreSQL pgvector.
- Python code execution for exact calculations and data analysis.
- Human-in-the-loop pause/resume when the model needs clarification.
- OpenAI and Bedrock provider abstraction.

These additions make the app much more credible as an agentic AI portfolio project. It now shows orchestration control, tool contracts, durable state, resume semantics, and multiple reasoning modes.

## 2. Remaining Gaps

### 2.1 Research Depth

`web_search` is live through Tavily, but `summarise_url` is still a simulation. The agent can find links, but it does not yet fetch, parse, archive, and deeply read source pages. This limits citation quality and makes the digest dependent on search-result snippets unless the model follows up with other available data.

### 2.2 Memory Quality

Vector memory is implemented, but there is no chunking pipeline, source normalization, duplicate detection, or retrieval-quality evaluation. The database can store memories, but the agent still needs better guidance and tooling around when and how to save durable facts.

### 2.3 Metrics And Cost Control

The cost guardrail Lambda exists, but the orchestrator is not publishing `AgentRunCost` yet. Until token usage, model cost, duration, and tool count are captured per run, the MLOps story is incomplete.

### 2.4 Rate Limiting

The Redis sliding-window rate limiter exists, and ElastiCache is provisioned, but the tool executor does not use it before Tavily or model calls. High-concurrency runs can still hit external API limits.

### 2.5 Safety And Product Hardening

The code executor is isolated as a Lambda with a blocklist, but it is not a robust sandbox for arbitrary untrusted code. The Function URLs and WebSocket API are unauthenticated. Production use needs auth, authorization, input validation, abuse controls, and safer execution isolation.

### 2.6 Multi-Agent Collaboration

The orchestrator simulates separate personas through phases, but there are no separate researcher, analyst, critic, and writer agents with independent prompts, artifacts, or evaluation gates.

## 3. Recommended Next Milestones

### Milestone 1: Make Source Reading Real

Implement `summarise_url` for real source ingestion:

- fetch pages with timeouts and content-type checks
- extract readable text
- store raw or cleaned content in S3
- summarize with citation metadata
- return title, author/date when available, source URL, and key claims
- save high-value chunks to vector memory

This is the biggest quality upgrade because it turns the app from search-snippet synthesis into actual source-grounded research.

### Milestone 2: Wire Observability And Cost Metrics

Track run-level metrics:

- token counts
- estimated provider cost
- tool-call count
- run duration
- model/provider used
- completion status
- HITL pause count

Then call `MetricsPublisher.publish_run_metrics()` from the orchestrator and validate the guardrail alarm with synthetic metrics.

### Milestone 3: Connect Rate Limiting

Use the Redis `RateLimiter` before external API calls:

- Tavily search
- model calls if provider limits need protection
- code executor invocation if abuse risk increases

Return tool-friendly rate-limit errors so the model can adapt rather than crash the run.

### Milestone 4: Add Evaluation And Tests

Add tests around the behaviors that define the product:

- trigger request validation
- digest merge and paused-run shaping
- HITL resume state transitions
- HITL timeout query/requeue behavior
- OpenAI tool-call mapping
- create-digest critic gate
- code executor blocked-keyword behavior
- memory save/search with a test database or mocked cursor

Add a small set of golden research topics and score output for citation count, source diversity, contradiction handling, and final structure.

### Milestone 5: Harden Security

Before public deployment:

- add authentication to Function URLs or move to authenticated API Gateway routes
- add WebSocket auth
- validate request payload sizes and shapes
- protect HITL resume from unauthorized run IDs
- add per-user ownership to runs, digests, and connections
- replace the blocklist-only sandbox with stronger isolation if code execution remains exposed

### Milestone 6: Improve Agent Architecture

Once source ingestion and observability are solid, split the current phase prompts into clearer roles:

- Planner: builds research strategy and acceptance criteria.
- Researcher: gathers and stores source-grounded evidence.
- Analyst: compares evidence, detects contradictions, and uses code for calculations.
- Critic: scores completeness and asks for more research when weak.
- Writer: produces the final digest.

This can be implemented inside one Lambda loop first, then separated later if the workload requires it.

## 4. Portfolio Positioning

The project now shows credible full-stack AI systems work:

- serverless event-driven architecture
- durable async execution
- live run streaming
- tool-calling agent loop
- HITL pause/resume
- vector memory
- code execution
- cloud infrastructure as code

To make it stand out even more, prioritize source-grounded ingestion, metrics, tests, and auth. Those additions will make the demo feel less like a scaffold and more like a dependable research product.
