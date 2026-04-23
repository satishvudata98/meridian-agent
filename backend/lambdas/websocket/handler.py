import json
import boto3
import os
from botocore.config import Config

from shared.run_access import RunAccessError, verify_run_access_token

aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
dynamodb = boto3.resource('dynamodb', config=aws_config)
# Note: we use our hardcoded AgentConnections table name for scaffolding
table_name = os.environ.get('CONNECTIONS_TABLE', 'AgentConnections')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """Handles WebSocket API Gateway $connect, $disconnect, and $default routes."""
    request_context = event.get('requestContext', {})
    route_key = request_context.get('routeKey')
    connection_id = request_context.get('connectionId')

    if route_key == '$connect':
        # Safely extract runId from the frontend WebSocket query string params
        qs = event.get('queryStringParameters') or {}
        run_id = (qs.get('runId') or '').strip()
        run_access_token = (qs.get('runAccessToken') or '').strip()

        if not run_id:
            return {'statusCode': 400, 'body': 'runId is required.'}

        try:
            verify_run_access_token(run_id, run_access_token)
        except RunAccessError as exc:
            print(f"Rejected connection for run {run_id}: {exc}")
            return {'statusCode': 401, 'body': 'Unauthorized.'}
        
        try:
            table.put_item(Item={
                'connection_id': connection_id,
                'run_id': run_id
            })
            print(f"Connected! Saved Connection ID {connection_id} mapped to Run {run_id}")
            return {'statusCode': 200, 'body': 'Connected.'}
        except Exception as e:
            print(f"Failed to save connection to DynamoDB: {e}")
            return {'statusCode': 500, 'body': 'Failed to connect.'}

    elif route_key == '$disconnect':
        try:
            table.delete_item(Key={'connection_id': connection_id})
            print(f"Disconnected! Purged Connection ID {connection_id}")
            return {'statusCode': 200, 'body': 'Disconnected.'}
        except Exception as e:
            print(f"Failed to delete connection: {e}")
            return {'statusCode': 500, 'body': 'Failed to disconnect.'}

    else:
        # Default route catch-all
        return {'statusCode': 200, 'body': 'Heartbeat valid.'}
