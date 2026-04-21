import boto3
from datetime import datetime

class MetricsPublisher:
    """Publishes custom MLOps metrics to AWS CloudWatch to monitor LLM Agent performance and cost"""
    
    def __init__(self, namespace="Meridian/Agent"):
        self.cloudwatch = boto3.client('cloudwatch')
        self.namespace = namespace

    def publish_run_metrics(self, topic_id: str, run_id: str, tokens_used: int, duration_seconds: int, cost_usd: float, tool_calls: int):
        metric_data = [
            {
                'MetricName': 'AgentTokensUsed',
                'Dimensions': [{'Name': 'TopicId', 'Value': topic_id}],
                'Value': tokens_used,
                'Unit': 'Count'
            },
            {
                'MetricName': 'AgentRunDuration',
                'Dimensions': [{'Name': 'TopicId', 'Value': topic_id}],
                'Value': duration_seconds,
                'Unit': 'Seconds'
            },
            {
                'MetricName': 'AgentRunCost',
                'Dimensions': [{'Name': 'TopicId', 'Value': topic_id}],
                'Value': cost_usd,
                'Unit': 'None'
            },
            {
                'MetricName': 'AgentToolCallCount',
                'Dimensions': [{'Name': 'TopicId', 'Value': topic_id}],
                'Value': tool_calls,
                'Unit': 'Count'
            }
        ]
        
        try:
            self.cloudwatch.put_metric_data(
                Namespace=self.namespace,
                MetricData=metric_data
            )
            print(f"Metrics successfully published to CloudWatch for Run {run_id}")
        except Exception as e:
            print(f"Failed to publish CloudWatch metrics: {e}")
