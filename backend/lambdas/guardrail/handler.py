import boto3
import os
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """EventBridge Daily Cron target to analyze CloudWatch costs and alert if exceeded"""
    cloudwatch = boto3.client('cloudwatch')
    sns = boto3.client('sns')
    
    threshold_usd = float(os.environ.get("DAILY_SPEND_LIMIT_USD", "5.0"))
    sns_topic_arn = os.environ.get("ALARM_SNS_TOPIC_ARN")
    
    # Check the last 24 hours of custom metrics
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=1)
    
    try:
        response = cloudwatch.get_metric_statistics(
            Namespace='Meridian/Agent',
            MetricName='AgentRunCost',
            StartTime=start_time,
            EndTime=end_time,
            Period=86400, # 1 day sum
            Statistics=['Sum']
        )
        
        total_cost = 0.0
        if response.get('Datapoints'):
             # Sort by timestamp in case of multiple, though 86400 period usually guarantees one point
            total_cost = response['Datapoints'][0]['Sum']
            
        print(f"Total Bedrock Agent spend for last 24h: ${total_cost:.4f}")
        
        if total_cost > threshold_usd:
            message = f"🚨 GUARDRAIL ALERT 🚨\n\nYour AI Agent architecture has spent ${total_cost:.4f} in the last 24h, exceeding the configured safety threshold of ${threshold_usd}.\n\nPlease check your CloudWatch anomaly dashboards."
            if sns_topic_arn:
                sns.publish(
                    TopicArn=sns_topic_arn,
                    Message=message,
                    Subject="Meridian Agent Cost Guardrail Triggered!"
                )
            print("Alert dispatched.")
            
        return {"status": "checked", "cost": total_cost, "threshold_breached": total_cost > threshold_usd}

    except Exception as e:
        print(f"Cost Guardrail execution failed: {e}")
        return {"status": "error", "message": str(e)}
