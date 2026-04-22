import json
import os
import uuid
import sys
from datetime import datetime
import boto3
import subprocess
from tavily import TavilyClient


class ToolExecutor:
    def __init__(self, llm_client=None, memory_store=None, run_id=None):
        self.run_id = run_id
        # Initializing the tool dependencies
        # Note: TAVILY_API_KEY must be accessible in system env params for lambda
        try:
            self.tavily_client = TavilyClient()
        except Exception:
             self.tavily_client = None

        self.llm = llm_client
        self.memory = memory_store
        
        # Initialize DynamoDB Client
        self.dynamodb = boto3.resource('dynamodb')
        self.digests_table_name = os.environ.get('DIGESTS_TABLE', 'ResearchDigests')

    def execute(self, tool_name, tool_input):
        print(f"Executing tool: {tool_name} with input: {tool_input}")
        try:
            if tool_name == "create_research_plan":
                return self._create_research_plan(tool_input)
            elif tool_name == "web_search":
                return self._web_search(tool_input)
            elif tool_name == "summarise_url":
                return self._summarise_url(tool_input)
            elif tool_name == "save_to_memory":
                return self._save_to_memory(tool_input)
            elif tool_name == "search_memory":
                return self._search_memory(tool_input)
            elif tool_name == "create_digest":
                return self._create_digest(tool_input)
            elif tool_name == "execute_code":
                return self._execute_code(tool_input)

            else:
                return f"Tool {tool_name} is not recognized."
        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"

    def _create_research_plan(self, args):
        topic_id = args.get("topic_id")
        plan_steps = args.get("plan_steps", [])
        print(f"Research plan created for {topic_id}: {plan_steps}")
        return f"SUCCESS: Research plan acknowledged. Now proceed with step 1: {plan_steps[0] if plan_steps else 'No steps provided.'}"

    def _web_search(self, args):
        query = args.get("query")
        num_results = args.get("num_results", 3)
        if not self.tavily_client:
             return "Tavily account not configured."
        
        response = self.tavily_client.search(query=query, search_depth="basic", max_results=num_results)
        return json.dumps(response.get("results", []))

    def _summarise_url(self, args):
        url = args.get("url")
        focus = args.get("focus", "general")
        # In a real deployed version, we fetch the URL using requests, extract HTML via BeautifulSoup,
        # and then pass the text to our `llm_client.fast_call` to summarise.
        # This acts as our foundational placeholder.
        return f"SIMULATION: Summarized content of {url} focusing on {focus}."

    def _save_to_memory(self, args):
        if self.memory and self.llm:
            content = args.get("content")
            topic_id = args.get("topic_id")
            source_url = args.get("source_url")
            embedding = self.llm.embed(content)
            return self.memory.save(content, topic_id, embedding, source_url)
        return "Memory Store or LLM Client not initialized."

    def _search_memory(self, args):
        if self.memory and self.llm:
            query = args.get("query")
            topic_id = args.get("topic_id")
            limit = args.get("limit", 3)
            query_embedding = self.llm.embed(query)
            return self.memory.search(topic_id, query_embedding, limit)
        return "Memory Store or LLM Client not initialized."

    def _create_digest(self, args):
        topic_id = args.get('topic_id', 'unknown')
        executive_summary = args.get('executive_summary', 'No summary provided.')
        detailed_analysis = args.get('detailed_analysis', 'No analysis provided.')
        citations = args.get('citations', [])
        confidence = args.get('confidence_score', 90)
        
        digest_id = f"digest-{uuid.uuid4().hex[:8]}"
        created_at = datetime.utcnow().isoformat()
        
        try:
            table = self.dynamodb.Table(self.digests_table_name)
            table.put_item(Item={
                'digest_id': digest_id,
                'run_id': self.run_id or 'unknown',
                'topic_id': topic_id,
                'executive_summary': executive_summary,
                'detailed_analysis': detailed_analysis,
                'citations': citations,
                'created_at': created_at,
                'confidence': confidence
            })
            return f"SUCCESS: Digest {digest_id} created for topic {topic_id}."
        except Exception as e:
            print(f"Failed to save digest: {e}")
            return f"ERROR: Failed to save digest. Details: {e}"

    def _execute_code(self, args):
        code = args.get("code")
        lambda_arn = os.environ.get("CODE_EXECUTOR_ARN")
        
        if lambda_arn:
            # AWS Environment: Invoke the isolated sandbox lambda
            try:
                client = boto3.client('lambda')
                response = client.invoke(
                    FunctionName=lambda_arn,
                    Payload=json.dumps({"code": code})
                )
                result = json.loads(response['Payload'].read().decode())
                # Result is inside the 'body' string returned by lambda_handler
                inner_body = json.loads(result.get("body", "{}"))
                
                output = inner_body.get("output", "")
                error = inner_body.get("error", "")
                
                if error:
                    return f"CODE ERROR/VIOLATION:\n{error}"
                return f"EXECUTION SUCCESS:\n{output}"
                
            except Exception as e:
                return f"SYSTEM ERROR: Failed to invoke code sandbox: {str(e)}"
        else:
            # Local Environment: Fallback to local subprocess execution
            print("Local environment detected. Running code in local subprocess.")
            try:
                # Basic security check even locally
                if "import os" in code or "subprocess" in code:
                    return "ERROR: Security violation detected in code."
                    
                result = subprocess.run(
                    [sys.executable, "-c", code],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                if result.stderr:
                    return f"CODE ERROR:\n{result.stderr}"
                return f"EXECUTION SUCCESS:\n{result.stdout}"
            except subprocess.TimeoutExpired:
                return "ERROR: Execution timed out."
            except Exception as e:
                return f"ERROR: {str(e)}"

