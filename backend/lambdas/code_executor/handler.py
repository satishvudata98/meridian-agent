import json
import sys
import subprocess
import tempfile
import os

def lambda_handler(event, context):
    """
    Isolated Python Code Execution Sandbox.
    Receives: {"code": "..."}
    Returns: {"output": "...", "error": "...", "execution_time_ms": ...}
    """
    code = event.get("code", "")
    timeout = event.get("timeout", 15)
    
    # 1. Pre-flight Security Scan (Basic Blocklist)
    forbidden = [
        "import os", "import subprocess", "import sys", "import shutil",
        "open(", "eval(", "exec(", "subprocess.", "os.", "__import__",
        "requests", "urllib", "socket", "pip"
    ]
    
    for word in forbidden:
        if word in code:
            return {
                "statusCode": 403,
                "body": json.dumps({
                    "output": "",
                    "error": f"Security Violation: Forbidden keyword '{word}' detected.",
                    "success": False
                })
            }

    # 2. Execution
    try:
        with tempfile.NamedTemporaryFile(suffix=".py", mode='w', delete=False) as tmp:
            tmp.write(code)
            tmp_path = tmp.name
        
        # Run the code using a separate process for time-limiting
        start_time = os.times().elapsed
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        end_time = os.times().elapsed
        execution_time_ms = int((end_time - start_time) * 1000)
        
        # Cleanup
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
        output = result.stdout
        error = result.stderr
        
        # Truncate large outputs to prevent context window overflow
        max_output_len = 4000
        if len(output) > max_output_len:
            output = output[:max_output_len] + "\n... [Output Truncated]"
            
        return {
            "statusCode": 200,
            "body": json.dumps({
                "output": output,
                "error": error,
                "execution_time_ms": execution_time_ms,
                "success": result.returncode == 0
            })
        }
        
    except subprocess.TimeoutExpired:
        return {
            "statusCode": 408,
            "body": json.dumps({
                "output": "",
                "error": "Execution Timeout: The code took longer than 15 seconds to run.",
                "success": False
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "output": "",
                "error": f"Unexpected Execution Error: {str(e)}",
                "success": False
            })
        }
