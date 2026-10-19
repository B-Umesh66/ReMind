# Local setup

Run PostgreSQL: `docker compose up -d`. Run Ollama natively on Windows, then pull `qwen3:4b` and `qwen3-embedding:0.6b`. Start backend and frontend according to the root README. Do not run both models concurrently without verifying RAM/VRAM utilization; the API configuration exposes one bounded AI queue for future generation routes.

