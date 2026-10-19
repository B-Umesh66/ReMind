# API overview

All routes are under `/api/v1` and use a Bearer JWT except registration, login, and health.

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET|POST /documents`, `GET|DELETE /documents/{id}`, `POST /documents/{id}/retry`
- `POST /rag/ask` returns a grounded answer and real chunk citations.
- `GET /concepts`, `GET /concepts/{id}`, `GET /knowledge-graph`
- `POST /assessments`, `GET /assessments/{id}`, `POST /questions/{id}/answer`
- `POST /revisions/rebuild`, `PATCH /revisions/{id}`, `GET /analytics`, `GET /dashboard`, `GET /health`

An unavailable Ollama service returns 503 from AI-dependent endpoints, never invented responses.
