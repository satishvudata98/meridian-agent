# 🚀 Autonomous AI Research Agent — Setup & Deployment Guide

> Current deployment guide: use [docs/deployment_setup_guide.md](docs/deployment_setup_guide.md).
>
> The rest of this README still contains older setup notes from the pre-auth Function URL flow and is not the source of truth for the current Cognito + HTTP API deployment.

This project is a **serverless AI research agent** built with AWS (Lambda, API Gateway, SQS, RDS, Bedrock) and a Next.js frontend.

Follow the steps below to deploy and run the system locally.

---

# 📦 Prerequisites

* AWS Account
* GitHub Account
* Vercel Account
* Tavily API Key (https://tavily.com)

---

# 🔐 1. AWS Parameter Store Setup

Go to:

AWS Console → Systems Manager → Parameter Store → Create Parameter

Create the following parameters:

## Database Password

```
Name: /agent/db_password
Type: String
Value: <your_postgres_password>
```

## Tavily API Key

```
Name: TAVILY_API_KEY
Type: String
Value: <your_tavily_api_key>
```

⚠️ Important:

* Use **String (NOT SecureString)** because the template uses `ssm:` resolution.

---

# 🔑 2. GitHub Secrets Setup

Go to:

GitHub → Repository → Settings → Secrets → Actions

Add:

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION = us-east-1
```

---

# 👤 3. AWS IAM User Setup

Create IAM user:

* Name: `github-deployer`
* Access: Programmatic only
* Permissions: `AdministratorAccess`

Then:

* Generate Access Keys
* Add them to GitHub Secrets

---

# 🗄️ 4. RDS PostgreSQL Setup

Go to:

AWS → RDS → Create Database

## Configuration:

* Engine: PostgreSQL
* Instance: db.t3.micro (free tier)
* Username: postgres
* Password: same as `/agent/db_password`

## Connectivity:

* Public access: YES

## Security Group:

Add inbound rule:

```
Type: PostgreSQL
Port: 5432
Source: 0.0.0.0/0
```

After creation:

* Copy DB endpoint

---

# ⚙️ 5. Deployment (CI/CD via GitHub)

Ensure `.github/workflows/deploy.yml` includes:

```
--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND
```

Then deploy:

```
git add .
git commit -m "deploy"
git push
```

---

# ☁️ 6. Fix Common Deployment Issues

## If deployment fails with:

```
ROLLBACK_COMPLETE
```

👉 Go to:
AWS → CloudFormation

👉 Delete stack:

```
ai-research-agent-prod
```

👉 Redeploy again

---

## If SSM errors occur:

Ensure:

| Parameter          | Type   |
| ------------------ | ------ |
| /agent/db_password | String |
| TAVILY_API_KEY     | String |

---

# 🌐 7. Get API URLs

## HTTP API (Backend)

AWS → API Gateway → HTTP API

Example:

```
https://abc123.execute-api.us-east-1.amazonaws.com
```

---

## WebSocket API

AWS → API Gateway → WebSocket → Stages → `prod`

Example:

```
wss://abc123.execute-api.us-east-1.amazonaws.com/prod
```

---

# 🎨 8. Frontend Deployment (Vercel)

Go to:

https://vercel.com → Import Project

Select:

```
frontend/
```

---

## Add Environment Variables

```
NEXT_PUBLIC_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_WS_URL=wss://abc123.execute-api.us-east-1.amazonaws.com/prod
```

---

## Deploy 🚀

---

# ✅ 9. Final Verification

Open your frontend and:

* Trigger agent run
* Verify:

  * ✅ API response working
  * ✅ WebSocket streaming working
  * ✅ No errors in console

---

# 📊 Observability (Optional)

Check:

* CloudWatch Logs
* AWS X-Ray
* SQS queues
* DLQ

---

# 🧠 Architecture Highlights

* Serverless backend (AWS Lambda + API Gateway)
* Async processing (SQS + DLQ)
* Vector memory (RDS + embeddings)
* LLM orchestration (Claude via Bedrock)
* Real-time UI (WebSocket streaming)
* Cost guardrails (CloudWatch + EventBridge)

---

# 🏁 Done!

You now have a fully working **Autonomous AI Research Agent** 🎉

---

# 💡 Notes

* Ensure all services are deployed in the same AWS region (`us-east-1`)
* Always delete failed stacks before redeploying
* Parameter Store names and types must match exactly

---

# 📬 Support

If you face issues, check:

* CloudFormation Events
* GitHub Actions logs
* CloudWatch logs

---

# ⭐ If you like this project, give it a star!
