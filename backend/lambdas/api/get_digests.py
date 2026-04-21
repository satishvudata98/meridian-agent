import json
import os
import boto3

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DIGESTS_TABLE', 'ResearchDigests')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
    }

    # Handle CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": cors_headers
        }

    try:
        # For this prototype, we scan the whole table and return the latest
        response = table.scan()
        items = response.get('Items', [])
        
        # Sort by created_at descending (newest first)
        items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        # Return top 10
        recent_digests = items[:10]
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(recent_digests)
        }
    except Exception as e:
        print(f"Error fetching digests: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Internal server error", "details": str(e)})
        }
