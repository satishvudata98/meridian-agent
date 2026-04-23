import json
import os

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config

from shared.auth_context import AuthorizationError, require_user_id
from shared.run_access import issue_run_access_token


aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
dynamodb = boto3.resource('dynamodb', config=aws_config)
runs_table_name = os.environ.get('RUNS_TABLE', 'AgentRuns')
stream_ticket_ttl_seconds = int(os.environ.get('STREAM_TICKET_TTL_SECONDS', '900'))


def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
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

        path_parameters = event.get('pathParameters') or {}
        run_id = path_parameters.get('run_id')

        if not run_id:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "run_id is required."})
            }

        runs_table = dynamodb.Table(runs_table_name)
        response = runs_table.query(
            KeyConditionExpression=Key('run_id').eq(run_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get('Items', [])
        run_record = items[0] if items else None

        if not run_record:
            return {
                "statusCode": 404,
                "headers": cors_headers,
                "body": json.dumps({"error": f"No run found for run_id: {run_id}"})
            }

        if run_record.get('user_id') != user_id:
            return {
                "statusCode": 403,
                "headers": cors_headers,
                "body": json.dumps({"error": f"Run {run_id} does not belong to the authenticated user."})
            }

        stream_ticket, expires_at = issue_run_access_token(
            run_id,
            ttl_seconds=stream_ticket_ttl_seconds,
            user_id=user_id,
        )

        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({
                "run_id": run_id,
                "run_access_token": stream_ticket,
                "run_access_expires_at": expires_at,
            })
        }
    except Exception as exc:
        print(f"Stream ticket error: {exc}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Internal server error", "details": str(exc)})
        }