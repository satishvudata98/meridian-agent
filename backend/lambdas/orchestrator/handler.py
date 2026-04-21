import sys
import os
import json

# Allow relative imports from the shared folder when running in Lambda
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))

from shared.bedrock_client import BedrockClient
from shared.tool_schemas import TOOL_SCHEMAS
from shared.tool_executor import ToolExecutor

def run_agent(topic: dict, run_id: str) -> dict:
    bedrock = BedrockClient()
    executor = ToolExecutor(bedrock_client=bedrock)
    
    max_steps = 10
    system_prompt = f"""You are an autonomous research agent. Your job is to thoroughly research the topic: {topic.get('name', 'General')}.
    Use your tools to search the web, summarise key sources, and save important findings to memory.
    When you have enough information (at least 3-5 high quality sources), call the 'create_digest' tool to finish."""

    # Initial Prompt
    messages = [
        {
            "role": "user", 
            "content": [{"type": "text", "text": f"Research this topic and create a digest: {topic.get('name', 'General')}"}]
        }
    ]

    for step in range(max_steps):
        print(f"\n--- Step {step + 1} ---")
        
        # In a real app, publish a WebSocket event so the Frontend can show a live terminal UI
        # publish_ws_event(run_id, {"step": step, "status": "thinking"})

        response = bedrock.fast_call(messages, system=system_prompt, tools=TOOL_SCHEMAS)
        
        stop_reason = response.get("stop_reason")
        response_content = response.get("content", [])
        
        # Append assistant's reasoning and tool calls to history
        messages.append({"role": "assistant", "content": response_content})
        
        if stop_reason == "end_turn":
            print("Model finished autonomously without tools.")
            break
            
        # Execute chosen tools
        if stop_reason == "tool_use":
            tool_results = []
            
            for block in response_content:
                if block.get("type") == "tool_use":
                    tool_name = block["name"]
                    tool_input = block["input"]
                    tool_id = block["id"]
                    
                    # Dispatch to implementation
                    result = executor.execute(tool_name, tool_input)
                    print(f" -> Tool result snippet: {str(result)[:100]}...")
                    
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": str(result)
                    })
            
            # Feed tool outputs back to the conversation
            messages.append({"role": "user", "content": tool_results})
            
            # If the specific create_digest tool was called, we can break gracefully
            if any(block.get("name") == "create_digest" for block in response_content if block.get("type") == "tool_use"):
                 print("Digest creation triggered. Loop complete.")
                 break

    return {"run_id": run_id, "steps_taken": step + 1, "status": "completed"}

def lambda_handler(event, context):
    """AWS Lambda entry point responding to SQS"""
    for record in event.get('Records', []):
        body = json.loads(record['body'])
        topic = {"name": body.get("topic_name", "Unknown")}
        run_id = body.get("run_id", "local_test_run")
        
        result = run_agent(topic, run_id)
        print(f"Agent finished: {result}")
        
    return {"statusCode": 200, "body": "Success"}

if __name__ == "__main__":
     # Local manual test execution hook
     run_agent({"name": "Recent innovations in Vector Databases 2025"}, "local-test-01")
