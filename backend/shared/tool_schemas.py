TOOL_SCHEMAS = [
    {
        "name": "web_search",
        "description": "Searches the web using Tavily API for specific queries when recent or external information is needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "num_results": {"type": "integer", "description": "Number of results to return (max 5)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "summarise_url",
        "description": "Fetches a webpage from a given URL and summarizes its key contents focusing on specific aspects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch"},
                "focus": {"type": "string", "description": "What specific information to look for in the text"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "save_to_memory",
        "description": "Saves important facts and research findings into the vector database for future retrieval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The specific factual content to save"},
                "topic_id": {"type": "string", "description": "The topic ID this memory belongs to"},
                "source_url": {"type": "string", "description": "The origin URL if applicable"}
            },
            "required": ["content", "topic_id"]
        }
    },
    {
        "name": "search_memory",
        "description": "Performs semantic search over past saved research memories relating to the current topic.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The query to search for"},
                "topic_id": {"type": "string", "description": "The topic ID to constrain the search"},
                "limit": {"type": "integer", "description": "Max results to return"}
            },
            "required": ["query", "topic_id"]
        }
    },
    {
        "name": "create_digest",
        "description": "Call this tool to finish the loop and compile the final digest once enough high-quality sources are found. Calling this means the agent process is complete.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic_id": {"type": "string"},
                "findings": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "A list of strings representing the key bullet points found."
                }
            },
            "required": ["topic_id", "findings"]
        }
    }
]
