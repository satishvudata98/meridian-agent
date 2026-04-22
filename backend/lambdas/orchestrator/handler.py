import sys
import os
import json

# Allow relative imports from the shared folder when running in Lambda
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

# Patch all libraries (boto3, requests) for X-Ray tracing
patch_all()

from shared.llm_factory import get_llm_client
from shared.tool_schemas import TOOL_SCHEMAS
from shared.tool_executor import ToolExecutor
from shared.metrics_publisher import MetricsPublisher

@xray_recorder.capture('run_agent_loop')
def run_agent(topic: dict, run_id: str) -> dict:
    llm = get_llm_client()
    executor = ToolExecutor(llm_client=llm)
    metrics = MetricsPublisher()
    
    # Store annotations for AWS X-Ray Filtering
    xray_recorder.put_annotation("topic_id", topic.get('name', 'Unknown'))
    xray_recorder.put_annotation("run_id", run_id)
    
    max_steps = 15
    current_phase = "planning"
    
    def get_system_prompt(phase):
        base = f"You are an autonomous research agent. Your job is to thoroughly research the topic: {topic.get('name', 'General')}.\n"
        if phase == "planning":
            return base + "You must FIRST call the 'create_research_plan' tool to outline your strategy before taking any other actions."
        elif phase == "researching":
            return base + "Execute your research plan. Use your tools to search the web and save important findings to memory. Once you have deep, comprehensive data, you may propose a digest using the 'create_digest' tool."
        elif phase == "writing":
            return base + "You are now in the Writer/Critic persona. Review your proposed digest. Ensure it has an executive summary, detailed analysis with contradictions, and citations. Call 'create_digest' again to submit the finalized version."
        return base

    # Initial Prompt
    messages = [
        {
            "role": "user", 
            "content": [{"type": "text", "text": f"Research this topic and create a digest: {topic.get('name', 'General')}"}]
        }
    ]

    for step in range(max_steps):
        print(f"\n--- Step {step + 1} | Phase: {current_phase} ---")
        
        # In a real app, publish a WebSocket event so the Frontend can show a live terminal UI
        # publish_ws_event(run_id, {"step": step, "phase": current_phase, "status": "thinking"})

        system_prompt = get_system_prompt(current_phase)
        response = llm.fast_call(messages, system=system_prompt, tools=TOOL_SCHEMAS)
        
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
                    
                    # Phase transitions and Tool Dispatch
                    if tool_name == "create_research_plan" and current_phase == "planning":
                        current_phase = "researching"
                        
                    if tool_name == "create_digest":
                        if current_phase != "writing":
                            # Intercept the first digest attempt and enforce a Critic review
                            current_phase = "writing"
                            result = "CRITIC REVIEW: Your proposed digest has been intercepted. Please review it. Does it contain deep analysis, synthesis of contradictions, and citations? If yes, call create_digest again with the finalized markdown. If no, continue researching or fix it."
                            print(" -> Intercepted create_digest for Critic review.")
                        else:
                            # Actually execute it on the second try
                            result = executor.execute(tool_name, tool_input)
                            print(f" -> Tool result snippet: {str(result)[:100]}...")
                    else:
                        result = executor.execute(tool_name, tool_input)
                        print(f" -> Tool result snippet: {str(result)[:100]}...")
                    
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": str(result)
                    })
            
            # Feed tool outputs back to the conversation
            messages.append({"role": "user", "content": tool_results})
            
            # If the specific create_digest tool was successfully executed, we can break gracefully
            if any(block.get("name") == "create_digest" for block in response_content if block.get("type") == "tool_use") and current_phase == "writing" and "SUCCESS" in str(tool_results[-1].get("content", "")):
                 print("Final Digest creation triggered. Loop complete.")
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
