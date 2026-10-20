# ReMind

ReMind is a local-first personal learning platform. It ingests study materials, records assessment evidence, calculates explainable knowledge-decay risk, and schedules targeted revision. Its core recommendation logic is deterministic; local Ollama models are reserved for extraction, retrieval, and generation.

## What is implemented

- Per-user registration/login and ownership-scoped API queries.
- PDF, DOCX, TXT, and Markdown ingestion; text extraction, chunking, embedding attempts, status tracking, retry, and cleanup.
- A polished React learning dashboard with real API-backed metrics and honest empty states.
- Knowledge concepts seeded only from explicit document headings (not claimed as mastery).
- Immutable-ready profile structure, deterministic decay-risk calculation, and revision recommendations.
- Ollama embedding, bounded grounded RAG, citations, health/model configuration visibility, and no paid-provider fallback.
- Assessment creation/taking, immutable attempt records, deterministic grading baseline, profile updates, graph API, and analytics.

## Run locally

1. Copy `.env.example` to `.env`. For a fast local preview, leave `DATABASE_URL` unset; the backend uses `remind.db`. For the intended stack, run `docker compose up -d` and use the PostgreSQL URL in `.env`.
2. Backend: `cd backend`, create a virtual environment, install `pip install -r requirements.txt`, then run `uvicorn app.main:app --reload`.
3. Frontend: `cd frontend`, run `npm install`, then `npm run dev`.
4. Open `http://localhost:5173`. Register with any email and an 8+ character password.

Do **not** open `frontend/index.html` by double-clicking it: browser module security will leave a blank page. Use Vite's URL above. For a single-server preview, run `npm run build` inside `frontend`, then start the backend and open `http://127.0.0.1:8000/`.

For local AI, install [Ollama](https://ollama.com), then run `ollama pull qwen3:4b` and `ollama pull qwen3-embedding:0.6b`. ReMind detects availability at `GET /api/v1/health`; it never claims a generative action succeeded when Ollama is unavailable.

After downloading models, start the local service with `ollama serve`. See [the Ollama integration pass notes](docs/PASS_OLLAMA_INTEGRATION.md) for the implemented workflows and verification status.

## Architecture and deliberate scope

The data path is user → document → extract/chunk → Ollama embedding → retrieval → assessment evidence → decay → revision. SQLite remains a lightweight development fallback. PostgreSQL is the intended deployment database; the current portable embedding store uses JSON vectors so SQLite tests can run, and should be migrated to a pgvector column/index before large-scale use.

Sessions are signed, expiring JWTs and passwords use Argon2 (legacy PBKDF2 hashes are upgraded at next login). Set a strong `JWT_SECRET` in `.env` before deployment.

## Migrations

For a fresh database: `cd backend; alembic upgrade head`. Existing pre-Alembic development databases must be backed up and inspected before `alembic stamp head`; do not run that command blindly on production data.

## Decay score

For a concept with assessment evidence:

`risk = min(100, 45 × (1 - accuracy) + min(45, 3 × days_since_success) + min(10, attempts))`

Concepts without attempts return `null`: ReMind does not infer a learner's retention from an upload alone. Scores are heuristics, not scientifically validated retention predictions.

## Tests

From `backend`: `pytest tests -q`.

## Project layout

```
backend/app/main.py     FastAPI routes, models, ingestion and scheduling
backend/tests/          deterministic decay tests
frontend/src/           responsive React interface
docker-compose.yml      PostgreSQL + pgvector local service
```

