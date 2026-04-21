import json
import os
import uuid
import boto3

sqs = boto3.client('sqs')
queue_url = os.environ.get('QUEUE_URL')

def lambda_handler(event, context):
    try:
        # Parse the incoming HTTP POST body
        body = json.loads(event.get('body', '{}'))
        topic_name = body.get('topic_name')
        
        if not topic_name:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "topic_name is required"})
            }
            
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        
        # Construct the payload for the orchestrator
        payload = {
            "topic_name": topic_name,
            "run_id": run_id
        }
        
        # Send message to SQS
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(payload)
        )
        
        return {
            "statusCode": 200,
            "body": json.dumps({"run_id": run_id, "status": "queued"})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error", "details": str(e)})
        }
