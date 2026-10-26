# Local setup

Run PostgreSQL: `docker compose up -d`. Run Ollama natively on Windows, then pull `qwen3:4b` and `qwen3-embedding:0.6b`. Start backend and frontend according to the root README. Do not run both models concurrently without verifying RAM/VRAM utilization; the API configuration exposes one bounded AI queue.

Optional Gemini generation is configured only in the backend environment:

```powershell
$env:AI_PROVIDER_MODE="auto"       # auto, gemini, or ollama
$env:GEMINI_API_KEY="your-key"     # required for gemini/auto cloud use
$env:GEMINI_MODEL="gemini-3.1-flash-lite"
```

Use `AI_PROVIDER_MODE=ollama` for privacy-preserving local-only mode. In `auto`, temporary Gemini timeouts and service failures fall back to Ollama; invalid keys and quota errors are reported instead of silently switching providers. Document embeddings remain local in all modes.
