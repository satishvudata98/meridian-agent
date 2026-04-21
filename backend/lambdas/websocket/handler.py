import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
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
        run_id = event.get('queryStringParameters', {}).get('runId', 'default_run')
        
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
