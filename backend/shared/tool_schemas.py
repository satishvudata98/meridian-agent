TOOL_SCHEMAS = [
    {
        "name": "create_research_plan",
        "description": "Call this tool FIRST before taking any other action. Outline your step-by-step plan to research the topic thoroughly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic_id": {"type": "string", "description": "The topic ID being researched"},
                "plan_steps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "A detailed, numbered list of steps you plan to take to research this topic."
                }
            },
            "required": ["topic_id", "plan_steps"]
        }
    },
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
        "description": "Call this tool to finish the loop and compile the final digest once enough high-quality sources are found. Calling this means the agent process is complete. The output must be highly detailed and formatted as markdown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic_id": {"type": "string"},
                "executive_summary": {
                    "type": "string",
                    "description": "A high-level markdown summary of the findings."
                },
                "detailed_analysis": {
                    "type": "string",
                    "description": "A comprehensive markdown report with sections, deep analysis, and synthesis of contradictions."
                },
                "citations": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "A list of URLs or sources used to compile this digest."
                },
                "confidence_score": {
                    "type": "integer",
                    "description": "A score from 1-100 representing your confidence in the factual accuracy and completeness of this digest."
                }
            },
            "required": ["topic_id", "executive_summary", "detailed_analysis", "citations", "confidence_score"]
        }
    },
    {
        "name": "execute_code",
        "description": "Write and execute Python code to perform precise calculations, compare numerical data, or analyze statistics from your research. Use this when you have numbers that need exact computation. Available libraries: math, statistics, json, datetime, decimal, collections.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Clean, self-contained Python code. CRITICAL: You MUST use print() to output your results. The sandbox only returns what is printed to stdout. If you don't print, you will see an empty result."
                },
                "justification": {
                    "type": "string",
                    "description": "Explain why code execution is necessary for this specific analysis step."
                }
            },
            "required": ["code", "justification"]
        }
    }
]
