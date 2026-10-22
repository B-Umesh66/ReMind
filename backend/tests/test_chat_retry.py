import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app, provider


def test_chat_retry_reuses_failed_user_message(monkeypatch):
    client = TestClient(app, raise_server_exceptions=False)
    registered = client.post('/api/v1/auth/register', json={
        'email': f'chat_retry_{uuid.uuid4().hex[:8]}@example.com',
        'password': 'password123',
    })
    headers = {'Authorization': f"Bearer {registered.json()['access_token']}"}
    conversation = client.post('/api/v1/chat/conversations', headers=headers, json={}).json()
    generation = AsyncMock(side_effect=[RuntimeError('temporary failure'), 'Recovered answer'])
    monkeypatch.setattr(provider.ollama, 'generate_chat_with_model', generation)

    failed = client.post(
        f"/api/v1/chat/conversations/{conversation['id']}/messages",
        headers=headers,
        json={'content': 'Explain normalization', 'provider': 'ollama'},
    )
    assert failed.status_code == 500
    history = client.get(f"/api/v1/chat/conversations/{conversation['id']}", headers=headers).json()['messages']
    user_message_id = history[0]['id']

    retried = client.post(
        f"/api/v1/chat/conversations/{conversation['id']}/messages",
        headers=headers,
        json={
            'content': 'Explain normalization',
            'provider': 'ollama',
            'retry_message_id': user_message_id,
        },
    )
    assert retried.status_code == 200, retried.text
    final_history = client.get(f"/api/v1/chat/conversations/{conversation['id']}", headers=headers).json()['messages']
    assert [message['role'] for message in final_history] == ['user', 'assistant']
    assert final_history[0]['id'] == user_message_id
