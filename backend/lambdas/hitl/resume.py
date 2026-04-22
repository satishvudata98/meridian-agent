import json
import os
import boto3

def lambda_handler(event, context):
    """
    HTTP endpoint the UI calls when the user submits an answer to the agent's question.
    POST body: { "run_id": "run-abc123", "answer": "Use the Yahoo Finance data" }
    """
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return _response(204, {})

    try:
        body = json.loads(event.get('body', '{}'))
        run_id = body.get('run_id')
        answer = body.get('answer', '').strip()

        if not run_id or not answer:
            return _response(400, {"error": "run_id and answer are required."})

        dynamodb = boto3.resource('dynamodb')
        hitl_table = os.environ.get('HITL_TABLE', 'AgentPausedState')
        table = dynamodb.Table(hitl_table)

        # Load the paused state
        result = table.get_item(Key={'run_id': run_id})
        item = result.get('Item')

        if not item:
            return _response(404, {"error": f"No paused run found for run_id: {run_id}"})

        if item.get('status') != 'awaiting_input':
            return _response(409, {"error": f"Run {run_id} is not awaiting input. Status: {item.get('status')}"})

        # Guard against double-submit: mark as resumed immediately
        table.update_item(
            Key={'run_id': run_id},
            UpdateExpression='SET #s = :s',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'resumed'}
        )

        # Put a new SQS message to re-trigger the Orchestrator with the saved state
        sqs = boto3.client('sqs')
        queue_url = os.environ.get('QUEUE_URL')
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps({
                "type": "hitl_resume",
                "run_id": run_id,
                "topic_name": item.get('topic_name', 'Unknown'),
                "human_answer": answer,
                "phase": item.get('phase', 'researching'),
                "pending_tool_use_id": item.get('pending_tool_use_id', ''),
                "messages": item.get('messages', '[]')  # Full conversation snapshot
            })
        )

        print(f"HITL resume triggered for run {run_id}. Answer: {answer[:80]}")
        return _response(200, {"message": "Answer submitted. Agent will resume shortly.", "run_id": run_id})

    except Exception as e:
        print(f"HITL resume error: {e}")
        return _response(500, {"error": str(e)})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        "body": json.dumps(body)
    }
