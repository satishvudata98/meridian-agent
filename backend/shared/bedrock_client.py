import boto3
import json

class BedrockClient:
    def __init__(self):
        # us-east-1 provides the highest availability for new Claude 3 models
        self.client = boto3.client("bedrock-runtime", region_name="us-east-1")
        self.haiku = "anthropic.claude-3-haiku-20240307-v1:0"
        self.sonnet = "anthropic.claude-sonnet-4-20250514-v1:0"

    def fast_call(self, messages, system="", max_tokens=1000, tools=None):
        """Use Haiku — cheap, fast, for tool decisions and summarization"""
        return self._invoke(self.haiku, messages, system, max_tokens, tools)

    def deep_call(self, messages, system="", max_tokens=4000, tools=None):
        """Use Sonnet — expensive, smart, for final synthesis only"""
        return self._invoke(self.sonnet, messages, system, max_tokens, tools)

    def _invoke(self, model_id, messages, system, max_tokens, tools=None):
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": messages
        }
        if system:
            body["system"] = system
            
        if tools:
            body["tools"] = tools

        response = self.client.invoke_model(
            modelId=model_id,
            body=json.dumps(body)
        )
        # Assuming we just return the full response body content, standard Bedrock format
        return json.loads(response["body"].read())

    def embed(self, text: str) -> list:
        """Generate vector embedding using Amazon Titan Embeddings v2"""
        # Titan Embeddings v2 model ID
        model_id = "amazon.titan-embed-text-v2:0"
        
        body = {
            "inputText": text,
            "dimensions": 1536,
            "normalize": True
        }
        
        response = self.client.invoke_model(
            modelId=model_id,
            body=json.dumps(body)
        )
        response_body = json.loads(response["body"].read())
        return response_body.get("embedding", [])
