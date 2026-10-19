# Architecture

`React/Vite → FastAPI /api/v1 → PostgreSQL + pgvector`, with Ollama running separately on the Windows host. The browser never communicates directly with Ollama. AI calls are intentionally planned to be sequential (`AI_CONCURRENCY_LIMIT=1`) for the target 16 GB RAM / 4 GB VRAM hardware.

The present implementation can use SQLite only as a development fallback. Use PostgreSQL with pgvector for production and before implementing vector retrieval.

