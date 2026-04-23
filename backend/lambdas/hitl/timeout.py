import json
import os
import time
import boto3
import uuid
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.config import Config


aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
dynamodb = boto3.resource('dynamodb', config=aws_config)
sqs = boto3.client('sqs', config=aws_config)

def lambda_handler(event, context):
    """
    Triggered by EventBridge Scheduler every 30 minutes.
    Finds all HITL paused runs whose 2-hour response window has expired
    and auto-resumes them with a best-guess instruction.
    """
    hitl_table_name = os.environ.get('HITL_TABLE', 'AgentPausedState')
    queue_url = os.environ.get('QUEUE_URL')
    now = int(time.time())

    table = dynamodb.Table(hitl_table_name)

    # Query the StatusExpiresIdx GSI: find stale awaiting_input items efficiently
    response = table.query(
        IndexName='StatusExpiresIdx',
        KeyConditionExpression=Key('status').eq('awaiting_input') & Key('expires_at').lt(now)
    )

    stale_items = response.get('Items', [])
    print(f"HITLTimeout: Found {len(stale_items)} stale paused run(s) to auto-resume.")

    for item in stale_items:
        run_id = item['run_id']
        timeout_request_id = f"timeout-{uuid.uuid4().hex}"
        timeout_requested_at = datetime.now(timezone.utc).isoformat()
        try:
            update_response = table.update_item(
                Key={'run_id': run_id},
                ConditionExpression='#status = :awaiting_input AND expires_at = :expires_at',
                UpdateExpression=(
                    'SET #status = :timed_out, '
                    'timeout_request_id = :timeout_request_id, '
                    'timeout_requested_at = :timeout_requested_at'
                ),
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':awaiting_input': 'awaiting_input',
                    ':expires_at': item.get('expires_at'),
                    ':timed_out': 'timed_out',
                    ':timeout_request_id': timeout_request_id,
                    ':timeout_requested_at': timeout_requested_at,
                },
                ReturnValues='ALL_NEW'
            )
            updated_item = update_response.get('Attributes', {})

            # Re-trigger the Orchestrator with a timeout message
            timeout_answer = (
                "HUMAN_TIMEOUT: The user did not respond within 2 hours. "
                "Proceed autonomously using your best professional judgment. "
                "Note in the report that this analysis was auto-completed after timeout."
            )
            sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps({
                    "type": "hitl_resume",
                    "run_id": run_id,
                    "user_id": updated_item.get('user_id'),
                    "timeout_request_id": timeout_request_id,
                    "topic_name": updated_item.get('topic_name', 'Unknown'),
                    "human_answer": timeout_answer,
                    "phase": updated_item.get('phase', 'researching'),
                    "pending_tool_use_id": updated_item.get('pending_tool_use_id', ''),
                    "messages": updated_item.get('messages', '[]')
                })
            )
            print(f"HITLTimeout: Auto-resumed run {run_id}.")

        except table.meta.client.exceptions.ConditionalCheckFailedException:
            print(f"HITLTimeout: Run {run_id} was already updated by another worker. Skipping.")

        except Exception as e:
            print(f"HITLTimeout: Failed to auto-resume run {run_id}: {e}")

    return {"statusCode": 200, "body": f"Processed {len(stale_items)} stale HITL run(s)."}
