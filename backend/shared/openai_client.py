import os
import json
from openai import OpenAI

class OpenAIClient:
    def __init__(self):
        # Requires OPENAI_API_KEY environment variable to be set
        self.client = OpenAI()
        # Default models for standard tiers
        self.fast_model = "gpt-4o-mini"
        self.deep_model = "gpt-4o"
        self.embed_model = "text-embedding-3-small"

    def fast_call(self, messages, system="", max_tokens=1000, tools=None):
        """Use a fast/cheap model for tool decisions and summarization"""
        return self._invoke(self.fast_model, messages, system, max_tokens, tools)

    def deep_call(self, messages, system="", max_tokens=4000, tools=None):
        """Use a more capable model for final synthesis"""
        return self._invoke(self.deep_model, messages, system, max_tokens, tools)

    def _invoke(self, model_id, messages, system, max_tokens, tools=None):
        # Convert Anthropic-style messages/tools to OpenAI style if needed, 
        # but assuming the orchestrator will pass a standard or generic format.
        # Note: If the agent orchestrator is heavily coupled to Anthropic's tool calling format,
        # we might need to map it here. For now, we assume simple text responses or basic OpenAI tool usage.
        
        # If the incoming messages are Anthropic style, we map them
        formatted_messages = []
        if system:
            formatted_messages.append({"role": "system", "content": system})
        
        for msg in messages:
             formatted_messages.append(msg)
             
        kwargs = {
            "model": model_id,
            "messages": formatted_messages,
            "max_tokens": max_tokens
        }
        
        # Mapping Bedrock/Anthropic tools to OpenAI functions (basic mapping)
        if tools:
            openai_tools = []
            for tool in tools:
                if "name" in tool and "description" in tool and "input_schema" in tool:
                    openai_tools.append({
                        "type": "function",
                        "function": {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parameters": tool["input_schema"]
                        }
                    })
            if openai_tools:
                kwargs["tools"] = openai_tools

        response = self.client.chat.completions.create(**kwargs)
        
        # Create a Bedrock-like response format to minimize changes in the Orchestrator
        # This is a simple mock mapping. The actual Orchestrator might need specific fields.
        message = response.choices[0].message
        
        # Build Anthropic-like content array
        content = []
        if message.content:
             content.append({"type": "text", "text": message.content})
             
        if message.tool_calls:
             for tool_call in message.tool_calls:
                 content.append({
                     "type": "tool_use",
                     "id": tool_call.id,
                     "name": tool_call.function.name,
                     "input": json.loads(tool_call.function.arguments)
                 })
                 
        return {
             "content": content,
             "role": "assistant"
        }

    def embed(self, text: str) -> list:
        """Generate vector embedding for the given text"""
        response = self.client.embeddings.create(
            input=[text],
            model=self.embed_model
        )
        # Returns a list of floats (1536 dimensions for text-embedding-3-small)
        return response.data[0].embedding
