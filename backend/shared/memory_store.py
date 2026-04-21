import psycopg2
import json

class MemoryStore:
    """Manages Vector Embeddings in PostgreSQL using pgvector"""
    def __init__(self, host, user, password, dbname="postgres"):
        self.conn = psycopg2.connect(
            host=host,
            user=user,
            password=password,
            dbname=dbname
        )
        self.conn.autocommit = True

    def initialize_schema(self):
        """Run once to enable pgvector and create tables."""
        with self.conn.cursor() as cur:
            # Requires Postgres 15+ and pgvector installed
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    topic_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector(1536), -- 1536 is standard for Titan/OpenAI embeddings
                    source_url TEXT,
                    metadata JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            # Create an IVFFlat index for fast cosine similarity search across vectors
            cur.execute("""
                CREATE INDEX IF NOT EXISTS memories_embedding_idx 
                ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
            """)

    def save(self, content: str, topic_id: str, embedding: list, source_url: str = None, metadata: dict = None):
        """Saves text and its computed vector embedding tuple to PostgreSQL."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO memories (topic_id, content, embedding, source_url, metadata)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (topic_id, content, embedding, source_url, json.dumps(metadata or {}))
            )
            return cur.fetchone()[0]

    def search(self, topic_id: str, query_embedding: list, limit: int = 3):
        """Vector semantic search using postgres <=> cosine similarity operator."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT content, source_url 
                FROM memories 
                WHERE topic_id = %s 
                ORDER BY embedding <=> %s::vector 
                LIMIT %s;
                """,
                (topic_id, query_embedding, limit)
            )
            return cur.fetchall()
