import sys
import os
import json
import boto3

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
from shared.memory_store import MemoryStore

@xray_recorder.capture('run_agent_loop')
def run_agent(topic: dict, run_id: str, resume_messages: list = None, human_answer: str = None) -> dict:
    llm = get_llm_client()
    
    # Initialize long-term vector memory. Gracefully skip if DB is unreachable.
    memory_store = None
    db_host = os.environ.get("DB_HOST")
    if db_host:
        try:
            memory_store = MemoryStore(
                host=db_host,
                user=os.environ.get("DB_USER", "agentadmin"),
                password=os.environ.get("DB_PASSWORD", ""),
                dbname=os.environ.get("DB_NAME", "postgres")
            )
            # Auto-provision schema on every cold start. All SQL uses IF NOT EXISTS,
            # so this is a safe no-op after the first successful run.
            memory_store.initialize_schema()
            print(f"Vector memory store connected and schema verified at {db_host}.")
        except Exception as e:
            print(f"WARNING: Could not connect to MemoryStore: {e}. Proceeding without memory.")
    else:
        print("WARNING: DB_HOST not set. Proceeding without vector memory.")

    executor = ToolExecutor(llm_client=llm, memory_store=memory_store, run_id=run_id)
    metrics = MetricsPublisher()
    
    # Store annotations for AWS X-Ray Filtering
    xray_recorder.put_annotation("topic_id", topic.get('name', 'Unknown'))
    xray_recorder.put_annotation("run_id", run_id)
    
    ws_endpoint = os.environ.get("WS_API_ENDPOINT")
    
    def publish_ws_event(run_id, payload):
        if not ws_endpoint:
            return
        try:
            dynamodb = boto3.resource('dynamodb')
            table = dynamodb.Table('AgentConnections')
            
            # Query the GSI to find all connections for this run_id
            response = table.query(
                IndexName='RunConnectionsIdx',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('run_id').eq(run_id)
            )
            
            connections = response.get('Items', [])
            if not connections:
                return
                
            http_endpoint = ws_endpoint.replace('wss://', 'https://')
            apigw = boto3.client('apigatewaymanagementapi', endpoint_url=http_endpoint)
            for conn in connections:
                try:
                    apigw.post_to_connection(
                        ConnectionId=conn['connection_id'],
                        Data=json.dumps(payload).encode('utf-8')
                    )
                except apigw.exceptions.GoneException:
                    pass # Connection is dead, ignore
                except Exception as e:
                    print(f"Failed to post to connection {conn['connection_id']}: {e}")
        except Exception as e:
            print(f"WebSocket broadcast failed: {e}")
    
    # Increased to 25 to accommodate Research + Code Sandbox + Self-Critique loops
    max_steps = 25
    current_phase = "planning"
    digest_submitted = False
    
    def get_system_prompt(phase):
        base = f"You are an autonomous research agent. Your job is to thoroughly research the topic: {topic.get('name', 'General')}.\n"
        if phase == "planning":
            return base + "You must FIRST call the 'create_research_plan' tool to outline your strategy before taking any other actions."
        elif phase == "researching":
            return base + "Execute your research plan. Use your tools to search the web and save important findings to memory. Once you have deep, comprehensive data, you may propose a digest using the 'create_digest' tool."
        elif phase == "writing":
            return base + "You are now in the Writer/Critic persona. Review your proposed digest. Ensure it has an executive summary, detailed analysis with contradictions, and citations. You MUST call the 'create_digest' tool to submit your final work. Do not finish your turn without calling this tool."
        return base

    # Initial Prompt
    # On resume: restore the full conversation history from the paused state.
    # On fresh run: start with the initial research prompt.
    if resume_messages:
        messages = resume_messages
        # Inject the human's answer as a tool_result so the agent understands what was said
        messages.append({
            "role": "user",
            "content": [{
                "type": "text",
                "text": f"[HUMAN GUIDANCE RECEIVED]: {human_answer}\n\nNow continue your research and produce the final digest."
            }]
        })
        print(f"Resuming HITL run {run_id} with human answer: {human_answer[:80]}...")
    else:
        messages = [
            {
                "role": "user",
                "content": [{"type": "text", "text": f"Research this topic and create a digest: {topic.get('name', 'General')}"}]
            }
        ]

    # Pass a live reference to the messages list so the HITL tool can snapshot the full conversation
    executor.messages_ref = messages


    for step in range(max_steps):
        print(f"\n--- Step {step + 1} | Phase: {current_phase} ---")
        
        # In a real app, publish a WebSocket event so the Frontend can show a live terminal UI
        publish_ws_event(run_id, {"step": step, "phase": current_phase, "status": "thinking", "message": f"Thinking in phase: {current_phase}..."})

        system_prompt = get_system_prompt(current_phase)
        response = llm.fast_call(messages, system=system_prompt, tools=TOOL_SCHEMAS)
        
        stop_reason = response.get("stop_reason")
        response_content = response.get("content", [])
        
        # Append assistant's reasoning and tool calls to history
        messages.append({"role": "assistant", "content": response_content})
        
        if stop_reason == "end_turn":
            if not digest_submitted:
                print("Model tried to exit without submitting a digest. Prodding...")
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "text", 
                        "text": "Wait! You have not submitted a final research digest. You MUST call 'create_digest' to finish the task, or 'ask_human_guidance' if you are stuck. Do not end your turn until you have finalized your work."
                    }]
                })
                continue
            else:
                print("Model finished autonomously after digest.")
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
                        
                    publish_ws_event(run_id, {"step": step, "phase": current_phase, "status": "tool_use", "tool": tool_name, "message": f"Using tool {tool_name}..."})
                        
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
                        
                    # HITL Pause: agent saved its state and wants to exit cleanly
                    if str(result) == "__HITL_PAUSE__":
                        print("HITL pause requested. Saving state and exiting Lambda.")
                        publish_ws_event(run_id, {
                            "step": step,
                            "phase": current_phase,
                            "status": "awaiting_human_input",
                            "message": "Agent is waiting for your guidance."
                        })
                        return {"run_id": run_id, "steps_taken": step + 1, "status": "awaiting_human_input"}

                    print(f" -> Tool result snippet: {str(result)[:100]}...")
                    
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": str(result)
                    })
            
            # Feed tool outputs back to the conversation
            messages.append({"role": "user", "content": tool_results})
            
            # If the specific create_digest tool was successfully executed, we can mark as submitted
            if any(block.get("name") == "create_digest" for block in response_content if block.get("type") == "tool_use") and current_phase == "writing" and "SUCCESS" in str(tool_results[-1].get("content", "")):
                 print("Final Digest creation triggered.")
                 digest_submitted = True
                 publish_ws_event(run_id, {"step": step, "phase": current_phase, "status": "completed", "message": "Digest created successfully."})
                 # We don't break immediately; we let the model have one last chance to 'end_turn' cleanly

    # If we reached the end of the loop without the break in tool_use
    if step == max_steps - 1:
        publish_ws_event(run_id, {"step": step, "phase": current_phase, "status": "completed", "message": "Agent reached maximum step limit (15) and stopped."})

    return {"run_id": run_id, "steps_taken": step + 1, "status": "completed"}

def lambda_handler(event, context):
    """AWS Lambda entry point responding to SQS — handles both fresh runs and HITL resumes."""
    for record in event.get('Records', []):
        body = json.loads(record['body'])
        run_type = body.get('type', 'fresh_run')
        run_id = body.get('run_id', 'local_test_run')

        if run_type == 'hitl_resume':
            # Resume a paused run using the saved conversation history
            topic = {"name": body.get("topic_name", "Unknown")}
            saved_messages = json.loads(body.get("messages", "[]"))
            human_answer = body.get("human_answer", "Proceed with your best judgment.")
            result = run_agent(
                topic, run_id,
                resume_messages=saved_messages,
                human_answer=human_answer
            )
        else:
            topic = {"name": body.get("topic_name", "Unknown")}
            result = run_agent(topic, run_id)

        print(f"Agent finished: {result}")

    return {"statusCode": 200, "body": "Success"}

if __name__ == "__main__":
     # Local manual test execution hook
     run_agent({"name": "Recent innovations in Vector Databases 2025"}, "local-test-01")
