# Meridian Deployment Setup Guide

Last updated: 2026-04-23

This is the current deployment guide for the auth-based Meridian app.

Use this guide instead of older setup notes that still mention public Lambda Function URLs such as `NEXT_PUBLIC_TRIGGER_URL`, `NEXT_PUBLIC_GET_DIGESTS_URL`, or `NEXT_PUBLIC_HITL_RESUME_URL`.

## 1. What This Guide Covers

This guide walks through the exact setup order for a clean deployment when you have not hosted the frontend yet.

At the end of this guide you will have:

- the AWS backend deployed with SAM
- Cognito Hosted UI configured with Google sign-in
- the required AWS Parameter Store keys created correctly
- the correct Vercel frontend environment variables filled in from real stack outputs
- matching `.env.example` files in the repo for local reference

## 2. Correct Deployment Order

Follow this order to avoid circular setup problems:

1. Choose the AWS region and Vercel project name.
2. Create the Vercel project first so you know the final frontend URL.
3. Compute the future Cognito Hosted UI domain and Google redirect URI.
4. Create the Google OAuth client.
5. Create the required SSM Parameter Store keys in AWS.
6. Deploy the SAM root stack.
7. Collect the stack outputs.
8. Add the frontend environment variables in Vercel.
9. Deploy the frontend.
10. Verify login, dashboard, run creation, and live streaming.

## 3. Before You Start

You need these accounts and tools:

- AWS account with access to CloudFormation, API Gateway, Cognito, Lambda, DynamoDB, RDS, and Systems Manager Parameter Store
- Vercel account
- Google Cloud account for OAuth client creation
- OpenAI API key
- Tavily API key
- AWS CLI configured locally
- AWS SAM CLI if you deploy from your machine
- Node.js for the frontend
- Python 3.12 for backend packaging and local checks

### 3.1 Install Local Tooling On Windows

Install the AWS CLI:

```powershell
winget install Amazon.AWSCLI
```

Install the AWS SAM CLI:

```powershell
winget install Amazon.SAM-CLI
```

If `winget` is unavailable, install from the official AWS installers:

- AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

Recommended for local Lambda emulation:

- Docker Desktop, because many `sam local` commands use containers.

Verify the installs:

```powershell
aws --version
sam --version
node --version
python --version
docker --version
```

### 3.2 What You Can Verify Locally Before Deploy

Useful local checks:

```powershell
sam validate --template-file infra/template.yaml
sam build --template-file infra/template.yaml
```

Frontend checks:

```powershell
Set-Location frontend
npm install
npm run lint
npm run build
```

Backend syntax checks:

```powershell
Set-Location ..
python -m py_compile backend\lambdas\api\trigger.py backend\lambdas\api\stream_ticket.py backend\lambdas\hitl\resume.py backend\lambdas\orchestrator\handler.py
```

What local SAM can and cannot prove:

- `sam validate` is good for template correctness.
- `sam build` is good for packaging and dependency resolution.
- `sam local invoke` can help with isolated Lambda debugging.
- `sam local start-api` is less representative here because the real deployment depends on Cognito auth, API Gateway request context, DynamoDB, SQS, and other AWS-managed resources.

For this repo, local verification is useful, but final integration still needs a real AWS deployment.

Current assumptions in this repo:

- AWS region: `us-east-1`
- frontend host: Vercel
- default LLM provider in the deployed template: `openai`

Important:

- The current infrastructure deploys with `LLM_PROVIDER=openai` in [infra/stacks/agent.yaml](../infra/stacks/agent.yaml).
- That means `OPENAI_API_KEY` is required for the default deployment path.
- If you want a Bedrock-only deployment, change `LLM_PROVIDER` before deployment and make sure Bedrock model access is enabled.

## 4. Decide The Frontend URL Before AWS Deploy

Because Cognito needs the frontend callback URL during backend deployment, you should reserve your Vercel project URL first.

### 4.1 Create The Vercel Project

In Vercel:

1. Import this repository.
2. Set the root directory to `frontend`.
3. Choose the final project name you want for the demo.
4. Note the production URL:

```text
https://<your-project-name>.vercel.app
```

Use that URL as your frontend base URL in this guide.

If you later rename the Vercel project or attach a custom domain, update `/agent/frontend_base_url`, then redeploy the SAM stack, and then redeploy the frontend.

### 4.2 Get Your AWS Account ID

PowerShell:

```powershell
$Region = "us-east-1"
$AccountId = aws sts get-caller-identity --query Account --output text
$AccountId
```

### 4.3 Compute The Cognito Hosted UI Domain And Google Redirect URI

The root SAM template creates the Cognito Hosted UI domain prefix like this:

```text
meridian-agent-<region>-<account-id>
```

So before deployment you can already derive the future Cognito Hosted UI URL:

```powershell
$FrontendBaseUrl = "https://<your-project-name>.vercel.app"
$HostedUiDomain = "https://meridian-agent-$Region-$AccountId.auth.$Region.amazoncognito.com"
$GoogleRedirectUri = "$HostedUiDomain/oauth2/idpresponse"

$HostedUiDomain
$GoogleRedirectUri
```

You will use:

- `$FrontendBaseUrl` in AWS Parameter Store as `/agent/frontend_base_url`
- `$GoogleRedirectUri` in Google Cloud OAuth settings

## 5. Create The Google OAuth Client

Go to Google Cloud Console.

1. Create or select a Google Cloud project.
2. Open `APIs & Services`.
3. If prompted, configure the OAuth consent screen first.
4. Choose `External` if this is your own demo/testing app.
5. Fill in the app name, support email, and developer contact email.
6. Add yourself as a test user if Google requires it.
7. Open `Credentials`.
8. Click `Create Credentials` -> `OAuth client ID`.
9. Choose `Web application`.
10. Give it a name such as `Meridian Cognito Google Login`.
11. Under `Authorized redirect URIs`, add this exact redirect URI:

```text
https://meridian-agent-<region>-<account-id>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

For example:

```text
https://meridian-agent-us-east-1-123456789012.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

12. Save the client.

After creation, copy:

- Google client ID
- Google client secret

You will store those in AWS Parameter Store.

Notes:

- Do not put the Vercel callback URL directly into the Google OAuth client. Google redirects to Cognito, and Cognito then redirects to your frontend.
- The frontend callback URL belongs in Cognito callback settings, which this SAM stack builds from `/agent/frontend_base_url`.
- If your Google app is still in testing mode, only listed test users can sign in.

## 6. Create The Required AWS Parameter Store Keys Before Deployment

Open AWS Console -> Systems Manager -> Parameter Store -> Create parameter.

Create every key below before running `sam deploy`.

### 6.1 Required Parameter Store Keys

| Name | Type | Required for deploy | Example value | Where the value comes from |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | `String` | Yes | `sk-...` | OpenAI dashboard |
| `TAVILY_API_KEY` | `String` | Yes | `tvly-...` | Tavily dashboard |
| `/agent/run_access_secret` | `String` | Yes | long random secret | Generate it yourself |
| `/agent/db_password` | `String` | Yes | strong database password | Generate it yourself |
| `/agent/auth/google_client_id` | `String` | Yes | `1234567890-abc.apps.googleusercontent.com` | Google Cloud OAuth client |
| `/agent/auth/google_client_secret` | `String` | Yes | `GOCSPX-...` | Google Cloud OAuth client |
| `/agent/frontend_base_url` | `String` | Yes | `https://your-project.vercel.app` | Your Vercel project URL |

Do not create these old keys:

- `WS_API_ENDPOINT`

That value is now wired directly from the API stack output into the agent stack and no longer needs a manual Parameter Store placeholder.

### 6.2 Exactly What To Enter In Parameter Store

For each parameter:

1. Name: use the exact value from the table above.
2. Tier: `Standard` is enough for a demo.
3. Type: use the exact type from the table.
4. Data type: `text`.
5. Value: paste the real value.

Recommended values:

- `OPENAI_API_KEY`: your real OpenAI key
- `TAVILY_API_KEY`: your real Tavily key
- `/agent/run_access_secret`: a random 48-byte or 64-byte secret
- `/agent/db_password`: a strong password you will not reuse anywhere else
- `/agent/auth/google_client_id`: the Google OAuth client ID
- `/agent/auth/google_client_secret`: the Google OAuth client secret
- `/agent/frontend_base_url`: your final Vercel production URL

### 6.3 PowerShell Commands To Generate The Secret Values

Generate a random run-access secret:

```powershell
$Bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
[Convert]::ToBase64String($Bytes)
```

Generate a strong database password:

```powershell
$Bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
[Convert]::ToBase64String($Bytes)
```

### 6.4 Optional AWS CLI Commands To Create The Parameters

If you prefer the CLI, these commands write the parameters exactly as the current templates expect:

```powershell
aws ssm put-parameter --region us-east-1 --name OPENAI_API_KEY --type String --value "sk-..." --overwrite
aws ssm put-parameter --region us-east-1 --name TAVILY_API_KEY --type String --value "tvly-..." --overwrite
aws ssm put-parameter --region us-east-1 --name /agent/run_access_secret --type String --value "<generated-secret>" --overwrite
aws ssm put-parameter --region us-east-1 --name /agent/db_password --type String --value "<generated-db-password>" --overwrite
aws ssm put-parameter --region us-east-1 --name /agent/auth/google_client_id --type String --value "<google-client-id>" --overwrite
aws ssm put-parameter --region us-east-1 --name /agent/auth/google_client_secret --type String --value "<google-client-secret>" --overwrite
aws ssm put-parameter --region us-east-1 --name /agent/frontend_base_url --type String --value "https://<your-project-name>.vercel.app" --overwrite
```

## 7. Deploy The AWS Backend

From the repository root:

```powershell
sam build --template-file infra/template.yaml
sam deploy --template-file infra/template.yaml --stack-name ai-research-agent-prod --resolve-s3 --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND
```

If you deploy through GitHub Actions instead, make sure the repository secrets exist:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## 8. Collect The Root Stack Outputs After Deployment

After a successful deploy, collect the root stack outputs.

You can get them from the CloudFormation console or by CLI.

CLI example:

```powershell
aws cloudformation describe-stacks --region us-east-1 --stack-name ai-research-agent-prod --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" --output table
```

The outputs you need are:

| Root stack output | What it is used for |
| --- | --- |
| `MeridianHttpApiUrl` | frontend API base URL |
| `MeridianWebSocketApiUrl` | frontend WebSocket URL |
| `CognitoHostedUiBaseUrl` | frontend Cognito domain |
| `CognitoUserPoolClientId` | frontend Cognito client ID |
| `CognitoUserPoolId` | useful for Cognito checks and debugging |
| `CognitoJwtIssuer` | useful for debugging authorizer issues |

## 9. Add The Frontend Environment Variables In Vercel

Now go to Vercel -> Project -> Settings -> Environment Variables.

Add these keys.

### 9.1 Required Frontend Environment Variables

| Vercel env key | Example value | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://abc123.execute-api.us-east-1.amazonaws.com` | `MeridianHttpApiUrl` |
| `NEXT_PUBLIC_WS_URL` | `wss://xyz789.execute-api.us-east-1.amazonaws.com/prod` | `MeridianWebSocketApiUrl` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `https://meridian-agent-us-east-1-123456789012.auth.us-east-1.amazoncognito.com` | `CognitoHostedUiBaseUrl` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `4l1exampleclientid` | `CognitoUserPoolClientId` |

These 4 keys are the hard requirements for the current frontend build.

### 9.2 Optional Frontend Auth Overrides

The frontend code supplies defaults for these values if you leave them unset:

| Vercel env key | Default when unset | When to set it manually |
| --- | --- | --- |
| `NEXT_PUBLIC_COGNITO_REDIRECT_URI` | `window.location.origin + /auth/callback` | set it only if you need a non-default callback URL |
| `NEXT_PUBLIC_COGNITO_LOGOUT_URI` | `window.location.origin + /` | set it only if you need a non-default logout return URL |
| `NEXT_PUBLIC_COGNITO_SCOPES` | `openid email profile` | set it only if you need different OAuth scopes |

Important:

- These are frontend build-time variables.
- The code hard-requires only `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_COGNITO_DOMAIN`, and `NEXT_PUBLIC_COGNITO_CLIENT_ID`.
- `NEXT_PUBLIC_COGNITO_REDIRECT_URI`, `NEXT_PUBLIC_COGNITO_LOGOUT_URI`, and `NEXT_PUBLIC_COGNITO_SCOPES` are optional overrides.
- If you change any `NEXT_PUBLIC_*` value later, redeploy the frontend.

### 9.3 Exact Mapping From AWS Outputs To Vercel Keys

Required mapping:

```text
MeridianHttpApiUrl        -> NEXT_PUBLIC_API_BASE_URL
MeridianWebSocketApiUrl   -> NEXT_PUBLIC_WS_URL
CognitoHostedUiBaseUrl    -> NEXT_PUBLIC_COGNITO_DOMAIN
CognitoUserPoolClientId   -> NEXT_PUBLIC_COGNITO_CLIENT_ID
```

Optional overrides:

```text
your Vercel URL + /auth/callback -> NEXT_PUBLIC_COGNITO_REDIRECT_URI
your Vercel URL + /              -> NEXT_PUBLIC_COGNITO_LOGOUT_URI
openid email profile             -> NEXT_PUBLIC_COGNITO_SCOPES
```

## 10. Deploy The Frontend In Vercel

After the Vercel environment variables are set:

1. Trigger a production deploy.
2. Open the deployed site.
3. Verify that the auth shell no longer reports missing configuration.

## 11. What You Do Not Need To Set Manually

You do not need to manually set Lambda environment variables in the AWS Console.

These are injected by SAM and CloudFormation during deployment:

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`
- `RUN_ACCESS_SECRET`
- `WS_API_ENDPOINT`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `QUEUE_URL`
- `RUNS_TABLE`
- `DIGESTS_TABLE`
- `HITL_TABLE`
- `CONNECTIONS_TABLE`
- `CODE_EXECUTOR_ARN`
- `STREAM_TICKET_TTL_SECONDS`
- `DAILY_SPEND_LIMIT_USD`
- `ALARM_SNS_TOPIC_ARN`

You also do not need to create these old frontend variables anymore:

- `NEXT_PUBLIC_TRIGGER_URL`
- `NEXT_PUBLIC_GET_DIGESTS_URL`
- `NEXT_PUBLIC_HITL_RESUME_URL`
- `NEXT_PUBLIC_API_URL`

Those belonged to the older public Function URL flow.

## 12. Local Reference Files In This Repo

Use these files as your current reference:

- [frontend/.env.example](../frontend/.env.example)
- [backend/.env.example](../backend/.env.example)

Purpose of each file:

- `frontend/.env.example`: the exact frontend keys you should put into Vercel or a local frontend `.env.local`
- `backend/.env.example`: local-only backend overrides if you want to run backend code outside AWS

## 13. End-To-End Verification Checklist

After both backend and frontend are deployed:

1. Open the Vercel site.
2. Click the Google sign-in button.
3. Complete login through Cognito Hosted UI.
4. Return to the dashboard.
5. Submit a topic.
6. Confirm you are navigated to `/runs/<run_id>`.
7. Confirm the run page connects to the WebSocket.
8. Wait for either completion or a human-in-the-loop pause.
9. Confirm digests appear in the dashboard.
10. Open a digest page and verify it loads.

## 14. Troubleshooting

### 14.1 SAM Deploy Fails Because A Parameter Is Missing

Check that all required Parameter Store keys from section 6 exist in `us-east-1` and that the names match exactly.

### 14.2 Cognito Sign-In Fails At Google

Check:

- the Google redirect URI is exactly `https://meridian-agent-<region>-<account-id>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
- the Google client ID is stored in `/agent/auth/google_client_id`
- the Google client secret is stored in `/agent/auth/google_client_secret`

### 14.3 Cognito Returns But Frontend Still Shows Missing Auth

Check the Vercel variables:

- `NEXT_PUBLIC_COGNITO_DOMAIN`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`

If you set custom overrides, also check:

- `NEXT_PUBLIC_COGNITO_REDIRECT_URI`
- `NEXT_PUBLIC_COGNITO_LOGOUT_URI`
- `NEXT_PUBLIC_COGNITO_SCOPES`

Then redeploy the frontend.

### 14.4 WebSocket Connects To The Wrong Place

Check `NEXT_PUBLIC_WS_URL` in Vercel.

The current code has a demo fallback URL in [frontend/src/lib/useAgentRunStream.ts](../frontend/src/lib/useAgentRunStream.ts), so do not rely on that fallback for real deployment.

### 14.5 You Change The Vercel Project URL Later

If the frontend URL changes:

1. update `/agent/frontend_base_url`
2. redeploy the SAM stack
3. update `NEXT_PUBLIC_COGNITO_REDIRECT_URI`
4. update `NEXT_PUBLIC_COGNITO_LOGOUT_URI`
5. redeploy the frontend

## 15. Final Source Of Truth

For deployment setup, use this file as the source of truth.

The code paths that define the current environment surface are:

- [frontend/src/lib/cognitoAuth.ts](../frontend/src/lib/cognitoAuth.ts)
- [frontend/src/lib/apiClient.ts](../frontend/src/lib/apiClient.ts)
- [frontend/src/lib/useAgentRunStream.ts](../frontend/src/lib/useAgentRunStream.ts)
- [infra/stacks/auth.yaml](../infra/stacks/auth.yaml)
- [infra/stacks/api.yaml](../infra/stacks/api.yaml)
- [infra/stacks/agent.yaml](../infra/stacks/agent.yaml)
- [infra/stacks/memory.yaml](../infra/stacks/memory.yaml)
- [infra/template.yaml](../infra/template.yaml)