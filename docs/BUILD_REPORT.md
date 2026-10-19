# ReMind build report

## Built in this iteration

- Central `OllamaProvider` with bounded concurrency, health/model discovery, embedding and generation calls, timeout handling, and clear offline errors.
- Embedding persistence keyed to a chunk and model identifier; document retry indexing; grounded RAG retrieval with user filtering and citations sourced from retrieved chunks.
- Argon2-first password hashing with safe upgrade support for earlier PBKDF2 hashes; signed, expiring JWTs; authenticated current-user endpoint and per-resource ownership checks.
- Persistent concept-edge, assessment, question, attempt, and embedding models, plus an initial Alembic migration.
- Assessment attempts update the profile only after an actual answer is submitted. The current offline-safe question authoring is an explicitly labelled source-grounded template, not fabricated LLM output.
- Analytics exposes actual recorded-attempt and revision statistics and returns `null` for absent evidence.

## Important limitations

The PostgreSQL schema migration currently stores vectors as JSON for SQLite compatibility. This is functional for small libraries but does not yet use native pgvector nearest-neighbour indexes. AI-assisted concept/relationship extraction, structured LLM question authoring, React Flow graph rendering, experiment comparison, and comprehensive frontend pages remain future work. These limitations are deliberate and documented; no fabricated model outputs or experimental outcomes are shown.

## Local model behavior

Ollama is required only for indexing and RAG answers. The dashboard, existing documents, assessment attempts, decay engine, revision scheduling, and analytics remain usable while Ollama is offline. Documents uploaded while it is offline stay `processed` rather than falsely claiming to be indexed; call the retry endpoint after installing the configured embedding model.

