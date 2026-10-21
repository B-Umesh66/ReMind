import asyncio
import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from app.ai import InvalidAIResponse, OllamaProvider
from app.main import GeneratedQuestion, GeneratedQuestions, app, provider, question_key, valid_generated_question


def test_question_key_collapses_case_whitespace_and_punctuation():
    assert question_key("What is memory decay?") == question_key("  WHAT  is memory-decay! ")


def test_question_key_keeps_different_questions_distinct():
    assert question_key("What is memory decay?") != question_key("Why does memory decay?")


def test_valid_generated_question_requires_supported_shape():
    question = GeneratedQuestion(
        kind="multiple_choice",
        prompt="Which process describes memory decay?",
        options=["A", "B", "C", "D"],
        answer="A",
        source_index=0,
    )
    assert valid_generated_question(question, 1, ["multiple_choice"])
    assert not valid_generated_question(question, 0, ["multiple_choice"])


def test_valid_generated_question_rejects_wrong_option_count():
    question = GeneratedQuestion(
        kind="multiple_choice",
        prompt="Which process describes memory decay?",
        options=["A", "B"],
        answer="A",
        source_index=0,
    )
    assert not valid_generated_question(question, 1, ["multiple_choice"])


def test_structured_accepts_json_followed_by_model_prose(monkeypatch):
    provider = OllamaProvider()
    monkeypatch.setattr(provider, "generate", AsyncMock(return_value='{"questions": [{"kind": "true_false", "prompt": "Is memory limited?", "options": ["True", "False"], "answer": "True", "explanation": "The passage says so.", "source_index": 0}]} Thanks.'))
    result = asyncio.run(provider.structured("Generate one question", GeneratedQuestions))
    assert result.questions[0].prompt == "Is memory limited?"


def test_structured_rejects_incomplete_json(monkeypatch):
    provider = OllamaProvider()
    monkeypatch.setattr(provider, "generate", AsyncMock(return_value='{"questions": [{"prompt": "unfinished"}'))
    try:
        asyncio.run(provider.structured("Generate questions", GeneratedQuestions))
    except InvalidAIResponse:
        return
    raise AssertionError("Incomplete JSON should raise InvalidAIResponse")


def test_assessment_replenishes_candidates_until_requested_count(monkeypatch):
    client = TestClient(app)
    email = f"questions_{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert registered.status_code == 200
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    uploaded = client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("java.txt", b"# LinkedList\n\nNodes connect to form a sequence. Traversal visits nodes.", "text/plain")},
    )
    assert uploaded.status_code == 200
    concept = client.get("/api/v1/concepts", headers=headers).json()[0]

    calls = 0

    async def generate_batch(*_args, **_kwargs):
        nonlocal calls
        start = calls * 8
        calls += 1
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"Which LinkedList fact is represented by item {start + index}?",
                options=["A", "B", "C", "D"],
                answer="A",
                explanation="Supported by the uploaded passage.",
                source_index=0,
            )
            for index in range(12)
        ])

    monkeypatch.setattr(provider, "structured", generate_batch)
    response = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"concept_id": concept["id"], "question_count": 20, "question_types": ["multiple_choice"], "difficulty": "medium"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["generated_count"] == 20
    assert body["partial"] is False
    detail = client.get(f"/api/v1/assessments/{body['id']}", headers=headers)
    assert detail.status_code == 200
    prompts = [question["prompt"] for question in detail.json()["questions"]]
    assert len(prompts) == len({question_key(prompt) for prompt in prompts}) == 20


def test_assessment_persists_partial_result_when_candidates_are_exhausted(monkeypatch):
    client = TestClient(app)
    email = f"partial_questions_{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert registered.status_code == 200
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("java.txt", b"# LinkedList\n\nNodes connect to form a sequence.", "text/plain")},
    )
    concept = client.get("/api/v1/concepts", headers=headers).json()[0]

    async def generate_small_batch(*_args, **_kwargs):
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"What is the one supported LinkedList fact?",
                options=["A", "B", "C", "D"],
                answer="A",
                explanation="Supported by the uploaded passage.",
                source_index=0,
            )
        ])

    monkeypatch.setattr(provider, "structured", generate_small_batch)
    response = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"concept_id": concept["id"], "question_count": 10, "question_types": ["multiple_choice"], "difficulty": "medium"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["generated_count"] == 1
    assert body["partial"] is True
    assert "instead of 10" in body["message"]


def test_assessment_stops_after_malformed_output_retries(monkeypatch):
    client = TestClient(app)
    email = f"malformed_questions_{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert registered.status_code == 200
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("java.txt", b"# LinkedList\n\nNodes connect to form a sequence.", "text/plain")},
    )
    concept = client.get("/api/v1/concepts", headers=headers).json()[0]
    calls = 0

    async def malformed(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise InvalidAIResponse("malformed test response")

    monkeypatch.setattr(provider, "structured", malformed)
    response = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"concept_id": concept["id"], "question_count": 10, "question_types": ["multiple_choice"], "difficulty": "medium"},
    )
    assert response.status_code == 502
    assert "no usable assessment" in response.json()["detail"]
    assert calls == 5
