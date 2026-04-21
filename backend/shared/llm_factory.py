import os

def get_llm_client():
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    
    if provider == "openai":
        from .openai_client import OpenAIClient
        return OpenAIClient()
    elif provider == "bedrock":
        from .bedrock_client import BedrockClient
        return BedrockClient()
    else:
        # Default fallback
        from .openai_client import OpenAIClient
        return OpenAIClient()
