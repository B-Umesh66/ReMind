# ReMind

ReMind is a local-first personal learning platform. It ingests study materials, records assessment evidence, calculates explainable knowledge-decay risk, and schedules targeted revision. Its core recommendation logic is deterministic; AI providers are used for text extraction, retrieval-augmented chat assistance, and assessment generation.

## What is implemented

- **Authentication & Multi-Tenant Isolation:** Per-user registration/login and ownership-scoped API queries using signed JWT sessions and Argon2 password hashing.
- **Document Ingestion Pipeline:** PDF, DOCX, TXT, and Markdown ingestion; text extraction, chunking, local vector embeddings, status tracking, retry, and cascade deletion.
- **Privacy-Preserving Local Embeddings:** Document chunk embeddings always run locally via Ollama (`qwen3-embedding:0.6b`), ensuring raw uploaded documents are never leaked to external cloud providers during ingestion.
- **Multi-Provider AI Architecture:**
  - **Ollama (local):** Local generation using models like `qwen2.5:3b` and `qwen3:4b`.
  - **Google Gemini (cloud):** Cloud generation using `gemini-2.0-flash` or `gemini-flash-latest`.
  - **Groq (cloud):** High-speed cloud generation with curated models:
    - `openai/gpt-oss-20b` (Default)
    - `qwen/qwen3.8-27b`
    - `openai/gpt-oss-120b`
- **Explicit Provider & Model Control:** Dedicated provider and model dropdown selectors in both the **Assessment Generation** and **AI Study Assistant** interfaces (with automatic mode removed in favor of intentional, predictable model selection).
- **Interactive AI Study Assistant:** Threaded chat conversations with persistence, rename, deletion, retry capability, markdown code copying, and optional grounded RAG citations from uploaded notes.
- **Assessment Generation & Adaptive Learning:** Assessment generation by concept with customizable question counts and types (multiple choice, true/false), deterministic grading baseline, attempt history, and analytics.
- **Knowledge Graph & Explainable Decay Score:** Seeded concept graphs, prerequisite/relationship visualization, and transparent retention risk tracking.

## Run locally

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- [Ollama](https://ollama.com) (for local embeddings and local generation)

### 1. Environment Setup
Copy `.env.example` to `backend/.env`:
```bash
cp .env.example backend/.env
```
Key configuration settings:
- **Database:** Leave `DATABASE_URL` unset for SQLite development fallback (`remind.db`), or provide a PostgreSQL connection URL.
- **Ollama:** `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_LLM_MODEL=qwen3:4b`, `OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b`.
- **Groq (Optional Cloud Provider):**
  - `GROQ_API_KEY=gsk_...`
  - `GROQ_DEFAULT_MODEL=openai/gpt-oss-20b` (Supported: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`)
  - `GROQ_TIMEOUT_SECONDS=120`
- **Gemini (Optional Cloud Provider):**
  - `GEMINI_API_KEY=...`
  - `GEMINI_MODEL=gemini-2.0-flash`
- **Default AI Provider Mode:** `AI_PROVIDER_MODE=ollama` (or `groq` / `gemini`).

> [!NOTE]
> The backend dynamically checks `.env` for API keys, so you do not need to restart the server when updating keys.

### 2. Start Ollama Services
Pull the required local models and start the service:
```bash
ollama pull qwen3:4b
ollama pull qwen2.5:3b
ollama pull qwen3-embedding:0.6b
ollama serve
```

### 3. Start Backend
```bash
cd backend
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```
The API is available at `http://127.0.0.1:8000`. Health and model availability can be checked at `http://127.0.0.1:8000/api/v1/health` and `/api/v1/chat/providers`.

### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser. Register with any email and an 8+ character password.

## Architecture and Scope

The data flow is:
```
User Upload → Text Extraction → Chunking → Local Ollama Embeddings → Vector Retrieval
                                                                             ↓
Decay Risk ← Assessment Evidence ← Assessment Taking ← AI Generation (Ollama / Gemini / Groq)
```

- **Data Privacy:** Raw document ingestion and embeddings always run locally via Ollama. When using Groq or Gemini for chat or assessments, only the relevant context query and retrieved excerpt are submitted.
- **Database:** SQLite is used for rapid local development; PostgreSQL with `pgvector` is supported via `docker-compose.yml` for production deployments.
- **Security:** Signed, expiring JWTs (`HS256`) and password hashing with Argon2.

## Decay Score Calculation

For a concept with assessment evidence:
```
risk = min(100, 45 × (1 - accuracy) + min(45, 3 × days_since_success) + min(10, attempts))
```
Concepts without assessment attempts return `null`: ReMind never assumes retention simply because a document was uploaded.

## Tests

Run the backend test suite from `backend`:
```bash
python -m pytest -v
```

## Project Layout

```
backend/
├── app/
│   ├── main.py         # FastAPI routes, schemas, database models, and chat/assessment APIs
│   └── ai.py           # HybridAIProvider, GroqProvider, GeminiProvider, OllamaProvider
├── tests/              # Test suite covering decay, chat, assessment generation, and Groq
└── requirements.txt    # Python dependencies
frontend/
├── src/
│   ├── main.tsx        # React SPA: Dashboard, Study Assistant, Document Ingestion, Assessments
│   └── index.css       # Design system and responsive styling
└── package.json        # Frontend scripts and dependencies
docker-compose.yml      # PostgreSQL + pgvector local service
```
