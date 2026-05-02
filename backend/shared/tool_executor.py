import json
import os
import re
import uuid
import sys
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urlparse
import boto3
import subprocess
import requests
from bs4 import BeautifulSoup
from tavily import TavilyClient
from botocore.config import Config


aws_config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 2})
HTTP_TIMEOUT_SECONDS = 10
MAX_HTML_BYTES = 1_000_000
MAX_SUMMARY_CHARS = 12_000
SUMMARY_USER_AGENT = "MeridianAgent/0.1 (+https://meridian.local)"


class ToolExecutor:
    def __init__(self, llm_client=None, memory_store=None, run_id=None, messages_ref=None, topic_name=None, user_id=None):
        self.run_id = run_id
        self.topic_name = topic_name
        self.user_id = user_id
        self.messages_ref = messages_ref  # Live reference to the conversation history for HITL state saving
        # Initializing the tool dependencies
        # Note: TAVILY_API_KEY must be accessible in system env params for lambda
        try:
            self.tavily_client = TavilyClient()
        except Exception:
             self.tavily_client = None

        self.llm = llm_client
        self.memory = memory_store
        
        # Initialize DynamoDB Client
        self.dynamodb = boto3.resource('dynamodb', config=aws_config)
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
            elif tool_name == "ask_human_guidance":
                return self._ask_human_guidance(tool_input)


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

    def _extract_readable_document(self, html, url):
        soup = BeautifulSoup(html, "html.parser")

        for element in soup(["script", "style", "noscript", "svg", "canvas", "iframe", "header", "footer", "nav", "form"]):
            element.decompose()

        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        article = soup.find("article") or soup.find("main") or soup.body or soup
        text = article.get_text("\n", strip=True)
        text = unescape(text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text).strip()
        text = text[:MAX_SUMMARY_CHARS]

        metadata = {
            "url": url,
            "domain": urlparse(url).netloc,
            "title": title or url,
        }

        description_tag = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
        if description_tag and description_tag.get("content"):
            metadata["description"] = description_tag["content"].strip()

        author_tag = soup.find("meta", attrs={"name": "author"}) or soup.find("meta", attrs={"property": "article:author"})
        if author_tag and author_tag.get("content"):
            metadata["author"] = author_tag["content"].strip()

        published_tag = soup.find("meta", attrs={"property": "article:published_time"}) or soup.find("meta", attrs={"name": "pubdate"})
        if published_tag and published_tag.get("content"):
            metadata["published_at"] = published_tag["content"].strip()

        return metadata, text

    def _extract_summary_text(self, response):
        content = response.get("content", []) if isinstance(response, dict) else []
        text_chunks = []
        for block in content:
            if block.get("type") == "text" and block.get("text"):
                text_chunks.append(block["text"].strip())
        return "\n\n".join(chunk for chunk in text_chunks if chunk).strip()

    def _summarize_document(self, metadata, document_text, focus):
        if not self.llm:
            fallback = document_text[:1500]
            return json.dumps({
                "url": metadata["url"],
                "title": metadata.get("title"),
                "focus": focus,
                "summary": fallback,
                "source_metadata": metadata,
                "grounded": False,
                "note": "LLM client unavailable; returning extracted text excerpt instead of a generated summary."
            })

        prompt = (
            "Read the provided webpage extract and produce a grounded research note. "
            "Use only the provided content. If the focus is not covered, say so explicitly. "
            "Return concise markdown with sections: Summary, Key Facts, Relevance, Gaps.\n\n"
            f"Focus: {focus}\n"
            f"Source title: {metadata.get('title', 'Unknown')}\n"
            f"Source URL: {metadata['url']}\n"
            f"Source metadata: {json.dumps(metadata, ensure_ascii=True)}\n\n"
            "Webpage extract:\n"
            f"{document_text}"
        )

        response = self.llm.fast_call(
            messages=[{
                "role": "user",
                "content": [{"type": "text", "text": prompt}]
            }],
            system="You summarize fetched sources for a research agent. Stay grounded in the provided extract and avoid speculation.",
            max_tokens=900,
            tools=None,
        )
        summary_text = self._extract_summary_text(response)
        if not summary_text:
            raise ValueError("LLM returned no summary text for the fetched webpage.")

        return json.dumps({
            "url": metadata["url"],
            "title": metadata.get("title"),
            "focus": focus,
            "summary": summary_text,
            "source_metadata": metadata,
            "grounded": True,
        })

    def _summarise_url(self, args):
        url = args.get("url")
        focus = args.get("focus", "general")
        if not url:
            return "ERROR: url is required."

        try:
            response = requests.get(
                url,
                timeout=HTTP_TIMEOUT_SECONDS,
                headers={
                    "User-Agent": SUMMARY_USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml"
                },
                stream=True,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            return f"ERROR: Failed to fetch {url}. Details: {exc}"

        content_type = (response.headers.get("Content-Type") or "").lower()
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            return f"ERROR: Unsupported content type for summarization: {content_type or 'unknown'}"

        raw_html = response.raw.read(MAX_HTML_BYTES + 1, decode_content=True)
        if len(raw_html) > MAX_HTML_BYTES:
            return f"ERROR: Document at {url} exceeded the {MAX_HTML_BYTES} byte ingestion limit."

        encoding = response.encoding or response.apparent_encoding or "utf-8"
        html = raw_html.decode(encoding, errors="replace")

        metadata, document_text = self._extract_readable_document(html, url)
        if not document_text:
            return f"ERROR: No readable text could be extracted from {url}."

        try:
            return self._summarize_document(metadata, document_text, focus)
        except Exception as exc:
            return f"ERROR: Failed to summarize fetched content from {url}. Details: {exc}"

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
        created_at = datetime.now(timezone.utc).isoformat()
        
        try:
            table = self.dynamodb.Table(self.digests_table_name)
            table.put_item(Item={
                'digest_id': digest_id,
            'user_id': self.user_id or 'anonymous',
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
                
                output = inner_body.get("output", "").strip()
                error = inner_body.get("error", "")
                
                if error:
                    return f"CODE ERROR/VIOLATION:\n{error}"
                if not output:
                    return "ERROR: Code executed successfully but produced NO output. Did you forget to use print() to display your results?"
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
                output = result.stdout.strip()
                if not output:
                    return "ERROR: Code executed successfully but produced NO output. Did you forget to use print() to display your results?"
                return f"EXECUTION SUCCESS:\n{output}"

            except subprocess.TimeoutExpired:
                return "ERROR: Execution timed out."
            except Exception as e:
                return f"ERROR: {str(e)}"

    def _ask_human_guidance(self, args):
        """Pauses the agent, saves full state to DynamoDB, and returns a sentinel signal."""
        import time
        question = args.get("question", "")
        context = args.get("context", "")
        pending_tool_use_id = args.get("_tool_use_id")
        phase = args.get("_phase", "researching")
        
        hitl_table = os.environ.get("HITL_TABLE", "AgentPausedState")
        ws_endpoint = os.environ.get("WS_API_ENDPOINT", "")
        
        now = int(time.time())
        expires_at = now + 7200   # 2-hour response window
        ttl = now + 86400         # 24-hour DynamoDB TTL for table hygiene

        try:
            dynamodb = boto3.resource('dynamodb')
            table = dynamodb.Table(hitl_table)
            table.put_item(
                Item={
                "run_id": self.run_id or "unknown",
                "user_id": self.user_id or "anonymous",
                "topic_name": self.topic_name or "Unknown",
                "phase": phase,
                "pending_tool_use_id": pending_tool_use_id or "",
                "question": question,
                "context": context,
                "status": "awaiting_input",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": expires_at,
                "ttl": ttl,
                # Save full conversation history so the agent can resume exactly where it stopped
                "messages": json.dumps(self.messages_ref or [])
                },
                ConditionExpression='attribute_not_exists(run_id) OR #status <> :awaiting_input',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':awaiting_input': 'awaiting_input'}
            )
            print(f"HITL state saved for run {self.run_id}. Question: {question[:80]}...")
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            print(f"HITL state for run {self.run_id} is already awaiting input. Reusing the existing pause record.")
        except Exception as e:
            print(f"WARNING: Failed to save HITL state: {e}")
            return f"ERROR: Could not save pause state. Proceed autonomously. ({e})"

        # Broadcast to any open WebSocket connections so the UI updates live
        if ws_endpoint:
            try:
                connections_table = dynamodb.Table("AgentConnections")
                response = connections_table.query(
                    IndexName='RunConnectionsIdx',
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('run_id').eq(self.run_id)
                )
                http_endpoint = ws_endpoint.replace('wss://', 'https://')
                apigw = boto3.client('apigatewaymanagementapi', endpoint_url=http_endpoint)
                for conn in response.get('Items', []):
                    try:
                        apigw.post_to_connection(
                            ConnectionId=conn['connection_id'],
                            Data=json.dumps({
                                "type": "hitl_question",
                                "question": question,
                                "context": context,
                                "run_id": self.run_id
                            }).encode('utf-8')
                        )
                    except Exception:
                        pass
            except Exception as e:
                print(f"WARNING: Could not broadcast HITL question via WebSocket: {e}")

        # This sentinel causes handler.py to break the agent loop and exit the Lambda
        return "__HITL_PAUSE__"


