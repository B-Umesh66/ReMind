# Ollama integration pass

## What was added

This pass connects ReMind's local-AI workflows to the installed Ollama model configuration:

- `qwen3-embedding:0.6b` creates one embedding per document chunk during indexing. A document only becomes `indexed` after all embeddings are stored; if Ollama is offline it remains `processed` and can be retried from **My Library**.
- `qwen3:4b` produces schema-validated, source-grounded concept extraction, graph relationships, and assessments containing 5–20 user-selected multiple-choice and/or true/false questions.
- RAG uses the embedding model to rank only the signed-in user's persisted chunks; Qwen answers with the selected passages and real citations.
- Model output is parsed as JSON, stripped of optional Qwen thinking text, then validated with Pydantic before it can create database records.
- The single semaphore controlled by `AI_CONCURRENCY_LIMIT` defaults to `1`, so the two models are not driven concurrently by the application.

## Frontend additions

- **My Library** lists actual documents and offers **Index with Ollama** and **Extract concepts** actions.
- **Knowledge Map** shows persisted concepts, their assessment state/risk, and evidence-backed relationship count.
- **Analytics** displays real attempt and revision statistics, using an em dash instead of pretending missing data is zero.

## Start Ollama

Downloading models is separate from starting the Ollama service. In a separate terminal, run:

```powershell
ollama serve
```

Then verify:

```powershell
ollama list
```

The output must include `qwen3:4b` and `qwen3-embedding:0.6b`. ReMind's **Health** API (`/api/v1/health`) reports the service and configured model names without revealing secrets.

## Verified this pass

- `npm run build` in `frontend`: passed.
- `python -m pytest tests -q` in `backend`: 3 passed.
- `python -m compileall app` in `backend`: passed.
- Local Ollama smoke test: passed — the embedding model returned a 1024-dimensional vector and Qwen3 4B returned the requested response.

## Honest limitations

This development build stores embedding vectors as JSON for SQLite compatibility. The retrieval logic is correct but linear, so PostgreSQL `pgvector` native vector indexes remain necessary before scaling to a large library. The current map is a responsive data view rather than a pan/zoom React Flow canvas. Automated Ollama integration tests cannot run until the local Ollama service is started.
