import json
import os
import time
import boto3
from boto3.dynamodb.conditions import Key, Attr

def lambda_handler(event, context):
    """
    Triggered by EventBridge Scheduler every 30 minutes.
    Finds all HITL paused runs whose 2-hour response window has expired
    and auto-resumes them with a best-guess instruction.
    """
    dynamodb = boto3.resource('dynamodb')
    sqs = boto3.client('sqs')

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
        try:
            # Mark as timed_out to prevent double-processing
            table.update_item(
                Key={'run_id': run_id},
                UpdateExpression='SET #s = :s',
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={':s': 'timed_out'}
            )

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
                    "topic_name": item.get('topic_name', 'Unknown'),
                    "human_answer": timeout_answer,
                    "phase": item.get('phase', 'researching'),
                    "pending_tool_use_id": item.get('pending_tool_use_id', ''),
                    "messages": item.get('messages', '[]')
                })
            )
            print(f"HITLTimeout: Auto-resumed run {run_id}.")

        except Exception as e:
            print(f"HITLTimeout: Failed to auto-resume run {run_id}: {e}")

    return {"statusCode": 200, "body": f"Processed {len(stale_items)} stale HITL run(s)."}
