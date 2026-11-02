# Local setup

Run PostgreSQL: `docker compose up -d`. Run Ollama natively on Windows, then pull `qwen3:4b` and `qwen3-embedding:0.6b`. Set `JWT_SECRET` to a random value of at least 32 bytes before deploying; local development generates and persists one in `backend/.jwt_secret` when omitted. Start backend and frontend according to the root README. Do not run both models concurrently without verifying RAM/VRAM utilization; the API configuration exposes one bounded AI queue.

Optional Gemini generation is configured only in the backend environment. The backend supports explicit provider modes and an automatic fallback mode:

```powershell
$env:AI_PROVIDER_MODE="auto"       # auto, gemini, groq, or ollama
$env:GEMINI_API_KEY="your-key"     # required for gemini/auto cloud use
$env:GEMINI_MODEL="gemini-3.1-flash-lite"
```

Use `AI_PROVIDER_MODE=ollama` for privacy-preserving local-only mode, `gemini` or `groq` to require a specific cloud provider, or `auto` to prefer Gemini when configured and fall back to Ollama for supported temporary Gemini service failures. Invalid keys and quota errors are reported instead of silently switching providers. Document embeddings remain local in all modes.
