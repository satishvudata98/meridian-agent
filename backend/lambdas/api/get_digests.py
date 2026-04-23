import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from botocore.config import Config

from shared.auth_context import AuthorizationError, require_user_id

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
dynamodb = boto3.resource('dynamodb', config=aws_config)

def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
    }

    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers}

    try:
        try:
            user_id = require_user_id(event)
        except AuthorizationError as exc:
            return {
                "statusCode": 401,
                "headers": cors_headers,
                "body": json.dumps({"error": str(exc)})
            }

        # 1. Fetch completed digests
        digests_table = dynamodb.Table(os.environ.get('DIGESTS_TABLE', 'ResearchDigests'))
        d_response = digests_table.query(
            IndexName='UserDigestsIdx',
            KeyConditionExpression=Key('user_id').eq(user_id),
            ScanIndexForward=False,
            Limit=20,
        )
        digests = d_response.get('Items', [])
        
        # 2. Fetch paused runs (HITL)
        hitl_table = dynamodb.Table(os.environ.get('HITL_TABLE', 'AgentPausedState'))
        h_response = hitl_table.query(
            IndexName='UserPausedRunsIdx',
            KeyConditionExpression=Key('user_id').eq(user_id),
            ScanIndexForward=False,
            Limit=20,
        )
        paused_runs = h_response.get('Items', [])
        
        # Filter for only those awaiting input
        active_pauses = [
            {
                "digest_id": f"hitl-{item['run_id']}",
                "run_id": item['run_id'],
                "topic_id": item.get('topic_name', 'Paused Run'),
                "executive_summary": f"AGENT PAUSED: {item.get('question', 'Needs guidance')}",
                "question": item.get('question', 'Needs guidance'),
                "context": item.get('context', ''),
                "expires_at": item.get('expires_at'),
                "status": "awaiting_input",
                "created_at": item.get('created_at', '')
            }
            for item in paused_runs if item.get('status') == 'awaiting_input'
        ]
        
        # Merge and sort
        all_items = digests + active_pauses
        all_items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(all_items[:20], cls=DecimalEncoder)
        }
    except Exception as e:
        print(f"Error fetching digests: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Internal server error", "details": str(e)})
        }
