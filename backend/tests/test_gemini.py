import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai import (
    AICloudError,
    AIConfigurationError,
    GEMINI_ALL_SUPPORTED_MODELS,
    GEMINI_DEFAULT_MODEL,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_OPTIONS,
    GeminiProvider,
    HybridAIProvider,
)
from app.main import (
    GeneratedQuestion,
    GeneratedQuestions,
    app,
    provider,
)


def register_user(client: TestClient, prefix: str) -> dict[str, str]:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_gemini_model_registry_configuration():
    assert "gemini-3.1-flash-lite" in GEMINI_MODEL_OPTIONS
    assert "gemini-3.5-flash-lite" in GEMINI_MODEL_OPTIONS
    assert GEMINI_DEFAULT_MODEL == "gemini-3.1-flash-lite"

    # Deprecated models must NOT be in the selectable options
    assert "gemini-2.5-flash-lite" not in GEMINI_MODEL_OPTIONS
    assert "gemini-2.5-flash" not in GEMINI_MODEL_OPTIONS

    # But they are recognized in GEMINI_ALL_SUPPORTED_MODELS so old requests can be diagnosed cleanly
    assert "gemini-2.5-flash-lite" in GEMINI_ALL_SUPPORTED_MODELS
    assert "gemini-2.5-flash" in GEMINI_ALL_SUPPORTED_MODELS

    # Labels match official display names
    assert GEMINI_MODEL_LABELS["gemini-3.1-flash-lite"] == "Gemini 3.1 Flash Lite"
    assert GEMINI_MODEL_LABELS["gemini-3.5-flash-lite"] == "Gemini 3.5 Flash Lite"


def test_chat_providers_endpoint_returns_verified_gemini_models():
    client = TestClient(app)
    response = client.get("/api/v1/chat/providers")
    assert response.status_code == 200
    data = response.json()
    providers_map = {p["id"]: p for p in data.get("providers", [])}

    assert "gemini" in providers_map
    gemini_entry = providers_map["gemini"]
    assert gemini_entry["label"] == "Gemini (cloud)"

    model_ids = [m["id"] for m in gemini_entry.get("models", [])]
    assert "gemini-3.1-flash-lite" in model_ids
    assert "gemini-3.5-flash-lite" in model_ids
    # Deprecated models are NOT exposed as selectable options
    assert "gemini-2.5-flash-lite" not in model_ids
    assert "gemini-2.5-flash" not in model_ids


def test_create_chat_conversation_validates_gemini_models():
    client = TestClient(app)
    headers = register_user(client, "gemini_chat_create")

    # Valid model 3.5 Flash-Lite
    res_35 = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini", "model_preference": "gemini-3.5-flash-lite"},
    )
    assert res_35.status_code == 200
    assert res_35.json()["provider_preference"] == "gemini"
    assert res_35.json()["model_preference"] == "gemini-3.5-flash-lite"

    # Valid model 3.1 Flash-Lite
    res_31 = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini", "model_preference": "gemini-3.1-flash-lite"},
    )
    assert res_31.status_code == 200
    assert res_31.json()["model_preference"] == "gemini-3.1-flash-lite"

    # Default when omitted
    res_default = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini"},
    )
    assert res_default.status_code == 200
    assert res_default.json()["model_preference"] == GEMINI_DEFAULT_MODEL

    # Unsupported arbitrary model is rejected
    res_invalid = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini", "model_preference": "unsupported-gemini-xyz"},
    )
    assert res_invalid.status_code == 422
    assert "Unsupported Gemini model" in res_invalid.text

    # Cross-provider model is rejected
    res_cross = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini", "model_preference": "qwen2.5:3b"},
    )
    assert res_cross.status_code == 422
    assert "Unsupported Gemini model" in res_cross.text


def test_send_chat_message_uses_actual_gemini_model(monkeypatch):
    client = TestClient(app)
    headers = register_user(client, "gemini_msg")

    created = client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"provider_preference": "gemini", "model_preference": "gemini-3.5-flash-lite"},
    )
    conversation_id = created.json()["id"]

    mock_generate = AsyncMock(return_value="Binary search operates in O(log n) time.")
    monkeypatch.setattr(provider.gemini, "generate", mock_generate)
    monkeypatch.setattr(provider.gemini, "api_key", "mock-api-key")

    sent = client.post(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers=headers,
        json={
            "content": "What is the time complexity of binary search?",
            "provider": "gemini",
            "model": "gemini-3.5-flash-lite",
        },
    )
    assert sent.status_code == 200, sent.text
    msg = sent.json()["message"]
    assert msg["provider_used"] == "gemini"
    assert msg["model_used"] == "gemini-3.5-flash-lite"
    assert msg["content"] == "Binary search operates in O(log n) time."

    # Verify that the actual model argument was passed to gemini.generate
    mock_generate.assert_awaited_once()
    assert mock_generate.await_args.kwargs.get("model") == "gemini-3.5-flash-lite"


def test_assessment_generation_uses_actual_gemini_model(monkeypatch):
    client = TestClient(app)
    headers = register_user(client, "gemini_assess")

    # Upload document to create concept
    client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("algorithms.txt", b"# Sorting\nQuickSort partitions an array recursively.", "text/plain")},
    )
    concept = client.get("/api/v1/concepts", headers=headers).json()[0]

    captured_kwargs = {}

    async def mock_structured(prompt, schema, mode=None, model=None):
        captured_kwargs["mode"] = mode
        captured_kwargs["model"] = model
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"What is QuickSort fact {i}?",
                options=["Partitions array", "Uses hashtable", "Is linear", "Is hardware"],
                answer="A",
                explanation="QuickSort partitions recursively.",
                source_index=0,
            ) for i in range(5)
        ])

    monkeypatch.setattr(provider, "structured", mock_structured)

    # 1. Valid Gemini model
    res = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={
            "concept_id": concept["id"],
            "question_count": 5,
            "question_types": ["multiple_choice"],
            "difficulty": "medium",
            "provider_mode": "gemini",
            "model": "gemini-3.5-flash-lite",
        },
    )
    assert res.status_code == 200, res.text
    assert captured_kwargs["mode"] == "gemini"
    assert captured_kwargs["model"] == "gemini-3.5-flash-lite"

    # 2. Reject unsupported Gemini model
    res_bad = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={
            "concept_id": concept["id"],
            "question_count": 5,
            "question_types": ["multiple_choice"],
            "difficulty": "medium",
            "provider_mode": "gemini",
            "model": "non-existent-gemini",
        },
    )
    assert res_bad.status_code == 422
    assert "Unsupported Gemini model" in res_bad.text


def test_gemini_error_translator_sanitizes_and_classifies_errors():
    # 404 / deprecated model error
    err_dep = GeminiProvider._error(
        Exception("404 NOT_FOUND: models/gemini-2.5-flash is no longer available to new users."),
        model="gemini-2.5-flash",
    )
    assert not err_dep.retryable
    assert "deprecated or no longer available" in str(err_dep)
    assert "Gemini 3.5 Flash-Lite or Gemini 3.1 Flash-Lite" in str(err_dep)

    # 429 Daily quota exhaustion
    err_daily = GeminiProvider._error(
        Exception("429 RESOURCE_EXHAUSTED: Daily quota exceeded for per day limit."),
        model="gemini-3.1-flash-lite",
    )
    assert not err_daily.retryable
    assert "daily quota exhausted" in str(err_daily).lower()

    # 429 Per-minute rate limit
    err_rate = GeminiProvider._error(
        Exception("429 Rate limit reached for requests per minute."),
        model="gemini-3.1-flash-lite",
    )
    assert not err_rate.retryable
    assert "rate limit reached" in str(err_rate).lower()

    # 401 / 403 Authentication error
    err_auth = GeminiProvider._error(Exception("403 Forbidden: API key expired or invalid."))
    assert not err_auth.retryable
    assert "GEMINI_API_KEY" in str(err_auth)

    # 503 High demand / temporary unavailability (retryable)
    err_503 = GeminiProvider._error(Exception("503 Service Unavailable: High demand on model."))
    assert err_503.retryable

    # Never leaks sensitive API key strings
    secret_key = "AIzaSySecretApiKey1234567890"
    err_key = GeminiProvider._error(Exception(f"Error calling Gemini with key {secret_key}: 401 Unauthorized"))
    assert secret_key not in str(err_key)


def test_document_extraction_remains_isolated_from_gemini():
    """Verify document extraction continues using Ollama and is unaffected by Gemini selection."""
    client = TestClient(app)
    headers = register_user(client, "doc_extract_isolation")

    # Upload document
    uploaded = client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("sample.txt", b"# Networks\nRouters forward packets across networks.", "text/plain")},
    )
    doc_id = uploaded.json()["id"]

    # Even if default or active provider is Gemini, document extraction must only use Ollama
    with patch.object(provider.ollama, "structured", new_callable=AsyncMock) as mock_ollama_struct:
        from app.main import ExtractionResult
        mock_ollama_struct.return_value = ExtractionResult(concepts=[], relationships=[])

        res = client.post(f"/api/v1/documents/{doc_id}/extract-concepts", headers=headers)
        assert res.status_code == 200

        mock_ollama_struct.assert_awaited_once()
        # Ensure it passed provider.llm (the local Ollama model), not Gemini
        assert mock_ollama_struct.await_args.kwargs.get("model") == provider.llm
