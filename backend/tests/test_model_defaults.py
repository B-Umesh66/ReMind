def test_ollama_language_model_defaults_to_qwen3(monkeypatch):
    from app.ai import OllamaProvider

    monkeypatch.delenv("OLLAMA_LLM_MODEL", raising=False)

    assert OllamaProvider().llm == "qwen3:4b"


def test_chat_prefers_qwen25_while_extraction_keeps_qwen3():
    from app.ai import OLLAMA_CHAT_DEFAULT_MODEL, OLLAMA_CHAT_MODEL_OPTIONS, OLLAMA_MODEL_OPTIONS

    assert OLLAMA_CHAT_DEFAULT_MODEL == "qwen2.5:3b"
    assert OLLAMA_CHAT_MODEL_OPTIONS == ("qwen2.5:3b", "qwen3:4b")
    assert OLLAMA_MODEL_OPTIONS[0] == "qwen3:4b"
