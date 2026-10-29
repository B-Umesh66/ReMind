import asyncio
import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from app.ai import AICloudError, AIConfigurationError, HybridAIProvider, InvalidAIResponse, OllamaProvider
from app.main import GeneratedQuestion, GeneratedQuestions, app, answer_matches, provider, question_key, valid_generated_question


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


def test_answer_matching_accepts_ollama_option_label_and_selected_text():
    from app.main import Question

    question = Question(
        kind="multiple_choice",
        prompt="Which item is correct?",
        options_json='["Correct answer", "Wrong answer", "Another answer", "None"]',
        answer="A",
    )
    assert answer_matches(question, "Correct answer")
    assert answer_matches(question, "A")
    assert not answer_matches(question, "Wrong answer")

def test_answer_matching_normalizes_option_labels_and_returns_canonical_option():
    from app.main import Question, correct_option

    question = Question(
        kind="multiple_choice",
        prompt="Which item is correct?",
        options_json='["Correct answer", "Wrong answer", "Another answer", "None"]',
        answer="A.",
    )
    assert answer_matches(question, "option a")
    assert answer_matches(question, "A. Correct answer")
    assert answer_matches(question, "Correct answer")
    assert not answer_matches(question, "B")
    assert correct_option(question) == (0, "Correct answer")

def test_valid_generated_question_rejects_answer_not_in_options():
    question = GeneratedQuestion(
        kind="multiple_choice",
        prompt="Which process describes memory decay?",
        options=["A complete answer", "Another answer", "A third answer", "A fourth answer"],
        answer="E",
        source_index=0,
    )
    assert not valid_generated_question(question, 1, ["multiple_choice"])


def test_structured_accepts_json_followed_by_model_prose(monkeypatch):
    provider = OllamaProvider()
    monkeypatch.setattr(provider, "generate", AsyncMock(return_value='{"questions": [{"kind": "true_false", "prompt": "Is memory limited?", "options": ["True", "False"], "answer": "True", "explanation": "The passage says so.", "source_index": 0}]} Thanks.'))
    result = asyncio.run(provider.structured("Generate one question", GeneratedQuestions))
    assert result.questions[0].prompt == "Is memory limited?"

def test_structured_passes_selected_ollama_model(monkeypatch):
    provider = OllamaProvider()
    calls = []
    async def generate(prompt, output_format=None, model=None):
        calls.append(model)
        return '{"questions": [{"kind": "true_false", "prompt": "Is memory limited?", "options": ["True", "False"], "answer": "True", "explanation": "The passage says so.", "source_index": 0}]}'
    monkeypatch.setattr(provider, "generate", generate)
    asyncio.run(provider.structured("Generate one question", GeneratedQuestions, model="qwen3:4b"))
    assert calls == ["qwen3:4b"]


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
    assert body["generation_duration_ms"] >= 0
    assert body["persistence_duration_ms"] >= 0
    assert calls == 2
    detail = client.get(f"/api/v1/assessments/{body['id']}", headers=headers)
    assert detail.status_code == 200
    prompts = [question["prompt"] for question in detail.json()["questions"]]
    assert len(prompts) == len({question_key(prompt) for prompt in prompts}) == 20


def test_assessment_submission_scores_questions_and_updates_status(monkeypatch):
    client = TestClient(app)
    email = f"submit_questions_{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert registered.status_code == 200
    headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
    uploaded = client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("java.txt", b"# LinkedList\n\nNodes connect to form a sequence.", "text/plain")},
    )
    assert uploaded.status_code == 200
    concept = client.get("/api/v1/concepts", headers=headers).json()[0]

    async def generate_batch(*_args, **_kwargs):
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"Which LinkedList fact is item {index}?",
                options=["A", "B", "C", "D"],
                answer="A",
                explanation="Supported by the uploaded passage.",
                source_index=0,
            )
            for index in range(5)
        ])

    monkeypatch.setattr(provider, "structured", generate_batch)
    created = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"concept_id": concept["id"], "question_count": 5, "question_types": ["multiple_choice"], "difficulty": "medium"},
    )
    assert created.status_code == 200, created.text
    assessment_id = created.json()["id"]
    questions = client.get(f"/api/v1/assessments/{assessment_id}", headers=headers).json()["questions"]

    submitted = client.post(
        f"/api/v1/assessments/{assessment_id}/submit",
        headers=headers,
        json={"answers": {str(question["id"]): "A" for question in questions}},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["score"] == 5
    assert len(submitted.json()["results"]) == 5
    assert submitted.json()["results"][0]["correct_answer"] == "A"
    assert submitted.json()["results"][0]["correct_option_index"] == 0
    assert submitted.json()["results"][0]["selected_answer"] == "A"

    detail = client.get(f"/api/v1/assessments/{assessment_id}", headers=headers)
    assert detail.json()["status"] == "completed"

    duplicate = client.post(
        f"/api/v1/assessments/{assessment_id}/submit",
        headers=headers,
        json={"answers": {str(question["id"]): "A" for question in questions}},
    )
    assert duplicate.status_code == 409


def test_assessment_submission_works_for_every_provider_mode(monkeypatch):
    client = TestClient(app)
    modes_seen = []

    async def generate_batch(*_args, **kwargs):
        modes_seen.append(kwargs.get("mode"))
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"Which LinkedList option is correct for item {index}?",
                options=["Nodes form a sequence", "Nodes are unrelated", "Nodes are encrypted", "Nodes are files"],
                answer="A",
                explanation="The uploaded passage states that nodes form a sequence.",
                source_index=0,
            )
            for index in range(5)
        ])

    monkeypatch.setattr(provider, "structured", generate_batch)
    for mode in ("gemini", "ollama", "auto"):
        email = f"submit_{mode}_{uuid.uuid4().hex[:8]}@example.com"
        registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
        assert registered.status_code == 200
        headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
        uploaded = client.post(
            "/api/v1/documents",
            headers=headers,
            files={"file": ("java.txt", b"# LinkedList\n\nNodes form a sequence.", "text/plain")},
        )
        assert uploaded.status_code == 200
        concept = client.get("/api/v1/concepts", headers=headers).json()[0]
        created = client.post(
            "/api/v1/assessments",
            headers=headers,
            json={
                "concept_id": concept["id"],
                "question_count": 5,
                "question_types": ["multiple_choice"],
                "difficulty": "medium",
                "provider_mode": mode,
            },
        )
        assert created.status_code == 200, created.text
        assessment_id = created.json()["id"]
        questions = client.get(f"/api/v1/assessments/{assessment_id}", headers=headers).json()["questions"]
        submitted = client.post(
            f"/api/v1/assessments/{assessment_id}/submit",
            headers=headers,
            json={"answers": {str(question["id"]): question["options"][0] for question in questions}},
        )
        assert submitted.status_code == 200, submitted.text
        assert submitted.json()["score"] == len(questions)
        assert client.get(f"/api/v1/assessments/{assessment_id}", headers=headers).json()["status"] == "completed"

    assert modes_seen == ["gemini", "ollama", "auto"]


def test_assessment_generation_uses_selected_concept_topic_source(monkeypatch):
    client = TestClient(app)
    email = f"topic_source_{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert registered.status_code == 200
    headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
    for filename, content in (
        ("linked.txt", b"# LinkedList\nNodes form a sequence."),
        ("database.txt", b"# Database\nConnections execute queries."),
    ):
        uploaded = client.post(
            "/api/v1/documents",
            headers=headers,
            files={"file": (filename, content, "text/plain")},
        )
        assert uploaded.status_code == 200
    concepts = client.get("/api/v1/concepts", headers=headers).json()
    linked = next(concept for concept in concepts if concept["name"] == "LinkedList")
    prompts = []

    async def generate_batch(prompt, *_args, **_kwargs):
        prompts.append(prompt)
        return GeneratedQuestions(questions=[
            GeneratedQuestion(
                kind="multiple_choice",
                prompt=f"Which LinkedList fact is item {len(prompts)}?",
                options=["A", "B", "C", "D"],
                answer="A",
                explanation="Supported by the selected source.",
                source_index=0,
            )
        ])

    monkeypatch.setattr(provider, "structured", generate_batch)
    response = client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"concept_id": linked["id"], "question_count": 5, "question_types": ["multiple_choice"], "difficulty": "medium"},
    )
    assert response.status_code == 200, response.text
    assert prompts
    assert "Nodes form a sequence." in prompts[0]
    assert "Connections execute queries." not in prompts[0]


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


class FakeProvider:
    def __init__(self, value="cloud", error=None):
        self.value = value
        self.error = error
        self.calls = []

    async def generate(self, prompt, output_format=None):
        self.calls.append(prompt)
        if self.error:
            raise self.error
        return self.value

    async def structured(self, prompt, schema):
        self.calls.append(prompt)
        if self.error:
            raise self.error
        return self.value


def test_auto_mode_prefers_configured_gemini(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider("cloud")
    gemini.api_key = "configured"
    monkeypatch.setenv("AI_PROVIDER_MODE", "auto")
    router = HybridAIProvider(ollama, gemini)
    assert asyncio.run(router.generate("private source")) == "cloud"
    assert router.last_provider == "gemini"
    assert len(ollama.calls) == 0


def test_auto_mode_falls_back_for_retryable_cloud_failure(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider(error=AICloudError("temporary timeout", retryable=True))
    gemini.api_key = "configured"
    monkeypatch.setenv("AI_PROVIDER_MODE", "auto")
    router = HybridAIProvider(ollama, gemini)
    assert asyncio.run(router.generate("private source")) == "local"
    assert router.last_provider == "ollama"
    assert len(ollama.calls) == 1


def test_auto_mode_does_not_fall_back_for_invalid_key(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider(error=AICloudError("bad key", retryable=False))
    gemini.api_key = "configured"
    monkeypatch.setenv("AI_PROVIDER_MODE", "auto")
    router = HybridAIProvider(ollama, gemini)
    try:
        asyncio.run(router.generate("private source"))
    except AICloudError as error:
        assert not error.retryable
    else:
        raise AssertionError("Invalid Gemini credentials must not silently fall back")
    assert len(ollama.calls) == 0


def test_gemini_only_reports_missing_configuration(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider("cloud")
    gemini.api_key = ""
    monkeypatch.setenv("AI_PROVIDER_MODE", "gemini")
    router = HybridAIProvider(ollama, gemini)
    try:
        asyncio.run(router.generate("private source"))
    except AIConfigurationError as error:
        assert "GEMINI_API_KEY" in str(error)
    else:
        raise AssertionError("Gemini-only mode must require configuration")
    assert len(ollama.calls) == 0


def test_ollama_mode_never_calls_gemini(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider("cloud")
    gemini.api_key = "configured"
    monkeypatch.setenv("AI_PROVIDER_MODE", "ollama")
    router = HybridAIProvider(ollama, gemini)
    assert asyncio.run(router.generate("private source")) == "local"
    assert len(gemini.calls) == 0


def test_per_request_provider_mode_overrides_default(monkeypatch):
    ollama = FakeProvider("local")
    gemini = FakeProvider("cloud")
    gemini.api_key = "configured"
    monkeypatch.setenv("AI_PROVIDER_MODE", "auto")
    router = HybridAIProvider(ollama, gemini)
    assert asyncio.run(router.generate("private source", mode="ollama")) == "local"
    assert router.last_provider == "ollama"
    assert len(gemini.calls) == 0
