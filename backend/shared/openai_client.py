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
            role = msg.get("role")
            content = msg.get("content", [])
            
            # If content is a simple string, it's already generic
            if isinstance(content, str):
                formatted_messages.append({"role": role, "content": content})
                continue
                
            # If content is a list of blocks, we need to translate Bedrock/Anthropic format to OpenAI
            if role == "user":
                # User messages might contain text blocks or tool_result blocks
                for block in content:
                    if block.get("type") == "text":
                        formatted_messages.append({"role": "user", "content": block.get("text")})
                    elif block.get("type") == "tool_result":
                        formatted_messages.append({
                            "role": "tool",
                            "tool_call_id": block.get("tool_use_id"),
                            "content": block.get("content")
                        })
            elif role == "assistant":
                # Assistant messages might contain text blocks or tool_use blocks
                openai_content = ""
                tool_calls = []
                for block in content:
                    if block.get("type") == "text":
                        openai_content += block.get("text") + "\n"
                    elif block.get("type") == "tool_use":
                        tool_calls.append({
                            "id": block.get("id"),
                            "type": "function",
                            "function": {
                                "name": block.get("name"),
                                "arguments": json.dumps(block.get("input"))
                            }
                        })
                
                assistant_msg = {"role": "assistant", "content": openai_content.strip() or None}
                if tool_calls:
                    assistant_msg["tool_calls"] = tool_calls
                formatted_messages.append(assistant_msg)
             
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
                 
        # Determine stop reason
        stop_reason = "end_turn"
        if message.tool_calls:
            stop_reason = "tool_use"
        elif response.choices[0].finish_reason == "length":
            stop_reason = "max_tokens"
            
        return {
             "content": content,
             "role": "assistant",
             "stop_reason": stop_reason
        }

    def embed(self, text: str) -> list:
        """Generate vector embedding for the given text"""
        response = self.client.embeddings.create(
            input=[text],
            model=self.embed_model
        )
        # Returns a list of floats (1536 dimensions for text-embedding-3-small)
        return response.data[0].embedding
