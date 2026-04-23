import json
import os
import uuid
import boto3
from datetime import datetime, timezone
from botocore.config import Config

from shared.auth_context import AuthorizationError, require_user_id
from shared.run_access import issue_run_access_token

aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
sqs = boto3.client('sqs', config=aws_config)
dynamodb = boto3.resource('dynamodb', config=aws_config)
queue_url = os.environ.get('QUEUE_URL')
runs_table_name = os.environ.get('RUNS_TABLE', 'AgentRuns')

def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }

    # Handle CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": cors_headers
        }

    try:
        try:
            user_id = require_user_id(event)
        except AuthorizationError as exc:
            return {
                "statusCode": 401,
                "headers": cors_headers,
                "body": json.dumps({"error": str(exc)})
            }

        # Parse the incoming HTTP POST body
        body = json.loads(event.get('body', '{}'))
        topic_name = body.get('topic_name')
        
        if not topic_name:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "topic_name is required"})
            }
            
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        created_at = datetime.now(timezone.utc).isoformat()
        
        run_access_token, expires_at = issue_run_access_token(run_id)

        runs_table = dynamodb.Table(runs_table_name)
        runs_table.put_item(Item={
            "run_id": run_id,
            "created_at": created_at,
            "updated_at": created_at,
            "user_id": user_id,
            "topic_name": topic_name,
            "status": "queued"
        })

        # Construct the payload for the orchestrator
        payload = {
            "topic_name": topic_name,
            "run_id": run_id,
            "user_id": user_id,
            "run_created_at": created_at,
        }
        
        # Send message to SQS
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(payload)
        )
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({
                "run_id": run_id,
                "run_access_token": run_access_token,
                "run_access_expires_at": expires_at,
                "status": "queued"
            })
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Internal server error", "details": str(e)})
        }
