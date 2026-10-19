# ReMind

ReMind is a local-first personal learning platform. It ingests study materials, records assessment evidence, calculates explainable knowledge-decay risk, and schedules targeted revision. Its core recommendation logic is deterministic; local Ollama models are reserved for extraction, retrieval, and generation.

## What is implemented

- Per-user registration/login and ownership-scoped API queries.
- PDF, DOCX, TXT, and Markdown ingestion; text extraction, chunking, status tracking, and cascade deletion.
- A polished React learning dashboard with real API-backed metrics and honest empty states.
- Knowledge concepts seeded only from explicit document headings (not claimed as mastery).
- Immutable-ready profile structure, deterministic decay-risk calculation, and revision recommendations.
- Ollama health/model configuration visibility. No paid AI provider or silent fallback.

## Run locally

1. Copy `.env.example` to `.env`. For a fast local preview, leave `DATABASE_URL` unset; the backend uses `remind.db`. For the intended stack, run `docker compose up -d` and use the PostgreSQL URL in `.env`.
2. Backend: `cd backend`, create a virtual environment, install `pip install -r requirements.txt`, then run `uvicorn app.main:app --reload`.
3. Frontend: `cd frontend`, run `npm install`, then `npm run dev`.
4. Open `http://localhost:5173`. Register with any email and an 8+ character password.

For local AI, install [Ollama](https://ollama.com), then run `ollama pull qwen3:4b` and `ollama pull qwen3-embedding:0.6b`. ReMind detects availability at `GET /api/v1/health`; it never claims a generative action succeeded when Ollama is unavailable.

## Architecture and deliberate scope

The shipped vertical slice prioritizes the real data path: user → document → extract/chunk → concept/profile → decay → revision dashboard. PostgreSQL/pgvector configuration is included, but vector embedding, RAG generation, assessment generation/evaluation, Alembic migrations, JWT hardening, and the full graph UI are explicitly outstanding. They should be added before describing this as a complete academic submission.

Sessions are signed, expiring JWTs and passwords are PBKDF2-SHA256-hashed. Set a strong `JWT_SECRET` in `.env` before deployment.

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

