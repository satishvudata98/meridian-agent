import json
import os
import boto3
import uuid
from datetime import datetime, timezone
from botocore.config import Config

from shared.auth_context import AuthorizationError, require_user_id


aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
dynamodb = boto3.resource('dynamodb', config=aws_config)
sqs = boto3.client('sqs', config=aws_config)

def lambda_handler(event, context):
    """
    HTTP endpoint the UI calls when the user submits an answer to the agent's question.
    POST body: { "run_id": "run-abc123", "answer": "Use the Yahoo Finance data" }
    """
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return _response(204, {})

    try:
        try:
            user_id = require_user_id(event)
        except AuthorizationError as exc:
            return _response(401, {"error": str(exc)})

        body = json.loads(event.get('body', '{}'))
        path_parameters = event.get('pathParameters') or {}
        run_id = body.get('run_id') or path_parameters.get('run_id')
        answer = body.get('answer', '').strip()

        if not run_id or not answer:
            return _response(400, {"error": "run_id and answer are required."})

        hitl_table = os.environ.get('HITL_TABLE', 'AgentPausedState')
        table = dynamodb.Table(hitl_table)

        resume_request_id = f"resume-{uuid.uuid4().hex}"
        resumed_at = datetime.now(timezone.utc).isoformat()

        try:
            update_response = table.update_item(
                Key={'run_id': run_id},
                ConditionExpression='#status = :awaiting_input AND user_id = :user_id',
                UpdateExpression=(
                    'SET #status = :resumed, resumed_by = :user_id, '
                    'resumed_at = :resumed_at, resume_request_id = :resume_request_id'
                ),
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':awaiting_input': 'awaiting_input',
                    ':resumed': 'resumed',
                    ':user_id': user_id,
                    ':resumed_at': resumed_at,
                    ':resume_request_id': resume_request_id,
                },
                ReturnValues='ALL_NEW'
            )
            item = update_response.get('Attributes', {})
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            result = table.get_item(Key={'run_id': run_id})
            item = result.get('Item')

            if not item:
                return _response(404, {"error": f"No paused run found for run_id: {run_id}"})
            if item.get('user_id') != user_id:
                return _response(403, {"error": f"Run {run_id} does not belong to the authenticated user."})
            return _response(409, {"error": f"Run {run_id} is not awaiting input. Status: {item.get('status')}"})

        # Put a new SQS message to re-trigger the Orchestrator with the saved state
        queue_url = os.environ.get('QUEUE_URL')
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps({
                "type": "hitl_resume",
                "run_id": run_id,
                "user_id": user_id,
                "resume_request_id": resume_request_id,
                "topic_name": item.get('topic_name', 'Unknown'),
                "human_answer": answer,
                "phase": item.get('phase', 'researching'),
                "pending_tool_use_id": item.get('pending_tool_use_id', ''),
                "messages": item.get('messages', '[]')  # Full conversation snapshot
            })
        )

        print(f"HITL resume triggered for run {run_id}. Answer: {answer[:80]}")
        return _response(200, {"message": "Answer submitted. Agent will resume shortly.", "run_id": run_id, "resume_request_id": resume_request_id})

    except Exception as e:
        print(f"HITL resume error: {e}")
        return _response(500, {"error": str(e)})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        "body": json.dumps(body)
    }
