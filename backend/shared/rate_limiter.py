import redis
import time

class RateLimiter:
    """Implement Sliding Window rate limiting using Redis to protect external API Quotas"""
    def __init__(self, host='localhost', port=6379, password=None):
        self.r = redis.Redis(host=host, port=port, password=password, decode_responses=True)

    def is_allowed(self, identifier: str, max_requests: int = 10, window_seconds: int = 60) -> bool:
        """
        Check if an identity passes the rate limit. Returns True if allowed, False if exceeded.
        """
        key = f"rate_limit:{identifier}"
        now = time.time()
        
        # Redis Transactions pipeline ensures atomic sliding window operations
        pipeline = self.r.pipeline()
        
        # 1. Remove obsolete timestamps older than the sliding window boundary
        pipeline.zremrangebyscore(key, 0, now - window_seconds)
        
        # 2. Add the current request's timestamp to the sorted set
        pipeline.zadd(key, {str(now): now})
        
        # 3. Count how many valid timestamps remain in the set (the current load)
        pipeline.zcard(key)
        
        # 4. Apply expiration to the key so old data automatically unloads from cache memory
        pipeline.expire(key, window_seconds)
        
        results = pipeline.execute()
        current_requests = results[2]  # the result of the zcard count command
        
        return current_requests <= max_requests
