import json
import os
from tavily import TavilyClient

class ToolExecutor:
    def __init__(self, llm_client=None, memory_store=None):
        # Initializing the tool dependencies
        # Note: TAVILY_API_KEY must be accessible in system env params for lambda
        try:
            self.tavily_client = TavilyClient()
        except Exception:
             self.tavily_client = None

        self.llm = llm_client
        self.memory = memory_store

    def execute(self, tool_name, tool_input):
        print(f"Executing tool: {tool_name} with input: {tool_input}")
        try:
            if tool_name == "web_search":
                return self._web_search(tool_input)
            elif tool_name == "summarise_url":
                return self._summarise_url(tool_input)
            elif tool_name == "save_to_memory":
                return self._save_to_memory(tool_input)
            elif tool_name == "search_memory":
                return self._search_memory(tool_input)
            elif tool_name == "create_digest":
                return self._create_digest(tool_input)
            else:
                return f"Tool {tool_name} is not recognized."
        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"

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
        # In a real flow, this triggers the SQS or DB write to log the finished digest.
        return f"SUCCESS: Digest created for topic {args.get('topic_id')} with {len(args.get('findings', []))} findings."
