import pytest
from app.main import app, GROQ_MODEL_OPTIONS
from app.ai import GroqProvider, HybridAIProvider
from starlette.testclient import TestClient

def test_groq_model_options_contains_gpt_oss_20b():
    assert GROQ_MODEL_OPTIONS == ("openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b")
    assert GROQ_MODEL_OPTIONS[0] == "openai/gpt-oss-20b"

def test_chat_providers_endpoint_includes_groq():
    client = TestClient(app)
    response = client.get("/api/v1/chat/providers")
    assert response.status_code == 200
    data = response.json()
    providers = {p["id"]: p for p in data.get("providers", [])}
    assert "groq" in providers
    assert providers["groq"]["label"] == "Groq (cloud)"
    models = [m["id"] for m in providers["groq"].get("models", [])]
    assert models == ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]

def test_hybrid_provider_accepts_groq():
    class DummyProvider:
        llm = "dummy"
        embedding = "dummy"
    ollama = DummyProvider()
    gemini = DummyProvider()
    groq = DummyProvider()
    hybrid = HybridAIProvider(ollama, gemini, groq)
    assert hybrid._selected_mode("groq") == "groq"
