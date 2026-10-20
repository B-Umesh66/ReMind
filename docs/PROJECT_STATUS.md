# ReMind — implementation status

**Last updated:** 20 October 2026  
**Status:** functional local-first prototype / academic project foundation; not yet feature-complete against the original master specification.

## Product implemented so far

### Frontend

- Polished responsive React/Vite interface with an account landing page, proper sign-in and create-account form, dashboard, document library, knowledge-map data view, analytics page, revision dashboard, loading/error/empty states, and mobile navigation.
- The frontend calls the FastAPI API; it does not call Ollama directly.
- The login UI stores the returned JWT in browser local storage and has a sign-out control.
- The previous blank-page issue was fixed by mounting React through `createRoot(...).render(...)`.

### Authentication and data isolation

- Registration and login endpoints.
- Argon2 password hashing for new accounts.
- Signed, expiring JWT tokens.
- Existing PBKDF2 hashes can be upgraded to Argon2 on a successful login.
- Current-user verification and ownership filters for user documents, concepts, graphs, assessments, questions, revisions, and analytics.
- CORS is configured for the local Vite frontend.

### Documents and ingestion

- Upload validation for PDF, DOCX, TXT, and Markdown.
- Configurable upload-size limit.
- Text extraction through PyMuPDF, python-docx, and UTF-8 handling.
- Empty/scanned-document warning when no selectable text exists.
- Chunk splitting with configurable size and overlap.
- Processing state, extracted-text preview API, document retry API, and owner-scoped deletion.
- The document library presents document state and can request indexing/concept extraction.

### Local AI / Ollama

- Centralized Ollama provider with configurable base URL, model names, timeouts, retry-related configuration, and concurrency limited to one task by default.
- Qwen3 Embedding 0.6B produces one embedding per chunk during indexing.
- Qwen3 4B is used for structured concept extraction, relationship extraction, source-grounded assessment generation, short-answer rubric feedback, and RAG answer generation.
- Pydantic validates structured model output before it is persisted.
- Qwen thinking preambles are stripped before JSON parsing.
- Clear failures for unavailable Ollama, malformed output, and insufficient evidence; no paid model or silent fake-AI fallback.
- Real local smoke test passed: `qwen3-embedding:0.6b` returned a 1024-dimensional embedding and `qwen3:4b` generated a response.

### RAG and source attribution

- Query embedding using the configured local embedding model.
- Retrieval is restricted to chunks belonging to the authenticated user.
- Relevance ranking using cosine similarity.
- Bounded context and Qwen-generated source-grounded answer.
- Returned citations contain the actual document name, chunk ID, optional page number, and excerpt.
- Honest no-evidence response when ranking yields no sufficiently relevant chunks.

### Concepts, profiles, and graph

- Baseline concepts from explicit Markdown headings.
- Optional Qwen concept extraction with source chunk provenance.
- Stored graph edges: `PART_OF`, `PREREQUISITE_OF`, `RELATED_TO`, `EXPLAINS`, and `APPLIED_IN`.
- Duplicate/self-edge prevention.
- User-scoped graph API and a frontend concept/map view.
- Per-concept profiles retain attempts, correct answers, last successful recall, and risk. Concepts without assessment evidence remain unassessed.

### Assessments, decay, and revisions

- Qwen-generated source-grounded multiple-choice, true/false, and short-answer questions.
- Objective questions use deterministic grading.
- Short answers use Qwen rubric grading with validated score and feedback.
- Every response is persisted as an assessment attempt and updates the associated concept profile.
- Deterministic decay calculation, independent of Ollama:

  `risk = min(100, 45 × (1 - accuracy) + min(45, 3 × days_since_success) + min(10, attempts))`

- No assessment attempts means a `null` risk score, never a fake low-risk score.
- Deterministic revision scheduler uses risk to create/update active recommendations and avoids duplicate active recommendations.
- Revision status transitions: recommended, scheduled, pending, completed, snoozed, skipped.

### Analytics and database

- Dashboard counts use live database records.
- Analytics returns observed attempt count, accuracy, individual attempt history, and revision completion rate; unavailable metrics are `null`.
- SQLAlchemy schema covers users, documents, chunks, embeddings, concepts, relationships, profiles, recommendations, assessments, questions, and attempts.
- Alembic configuration and an initial migration are present and successfully tested against a fresh SQLite database.
- Docker Compose configuration supplies PostgreSQL with the pgvector image.

### Documentation and validation

- Root README, architecture, local setup, API, knowledge-decay, build report, and Ollama-pass documentation.
- `backend/tests/test_decay.py`: 3 deterministic decay tests pass.
- Backend module compilation passes.
- Frontend production build passes.
- Fresh Alembic migration test passed.

## Still to implement before calling ReMind complete

The following requested capabilities are not finished and should not be presented as implemented:

1. **Native pgvector storage and indexes.** Embeddings are currently stored as JSON for SQLite development compatibility, and retrieval scans vectors in Python. PostgreSQL `vector` columns, `HNSW`/`IVFFlat` index setup, and an embedding re-index migration are still needed for scale.
2. **Production-grade migrations.** The initial Alembic migration exists, but upgrade paths from all early development schema revisions need tested, versioned migrations.
3. **Full knowledge-map canvas.** The current map is a data view. React Flow/Cytoscape pan, zoom, search, filtering, neighborhood loading, and source-detail panel remain.
4. **Assessment user experience.** API support is implemented, but dedicated creation, taking, feedback, results-history, and hint pages are not yet wired into the React navigation.
5. **Revision activity content.** Status and scheduling exist, but generated flashcards, worked examples, memory aids, comparison activities, scheduling settings, and completion outcome flows remain.
6. **Complete analytics UI.** The API returns real observations, but Recharts trend/risk-distribution views and clear sample-window controls are not built.
7. **Experimental evaluation framework.** Fixed-vs-adaptive experiment records, reproducible simulation/observation script, and methodology UI are not yet implemented.
8. **Test coverage.** Only decay tests are currently committed. Authentication, cross-user isolation, ingestion, AI-provider fakes, retrieval/citation, graph, assessment, revision-lifecycle, and frontend component tests still need to be added.
9. **Security hardening.** JWTs are valid and passwords are secure, but httpOnly cookie option, rate limiting, refresh/revocation strategy, audit logging policy, CSP/security headers, and production CORS allow-list configuration remain.
10. **Background job resilience.** Ingestion happens inline. A bounded durable job mechanism and UI progress polling are needed for large documents.
11. **OCR.** Scanned PDFs are detected but not OCR processed.
12. **Performance benchmarking.** No RAM/VRAM or latency benchmark has been recorded on the target hardware. The one-request AI concurrency setting is protective, not a benchmark result.

## How to use the current build

1. Run `ollama serve`.
2. Start the backend from `backend` with `python -m uvicorn app.main:app --reload`.
3. Start the frontend from `frontend` with `npm run dev`.
4. Open `http://localhost:5173`, create an account, upload material, then use **My Library** to index with Ollama and extract concepts.

## Important caveat

The deterministic decay formula is a transparent heuristic, not a clinically or scientifically validated predictor of memory retention. Local LLM grading is also an imperfect assessment signal and is explicitly recorded as such.
