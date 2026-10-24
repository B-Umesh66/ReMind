import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app, provider


def register(client: TestClient, prefix: str):
    response = client.post('/api/v1/auth/register', json={
        'email': f'{prefix}_{uuid.uuid4().hex[:8]}@example.com',
        'password': 'password123',
    })
    assert response.status_code == 200
    return {'Authorization': f"Bearer {response.json()['access_token']}"}


def test_chat_persists_ordered_history_and_enforces_ownership(monkeypatch):
    client = TestClient(app)
    owner = register(client, 'chat_owner')
    other = register(client, 'chat_other')
    created = client.post('/api/v1/chat/conversations', headers=owner, json={'provider_preference': 'ollama'})
    assert created.status_code == 200
    assert created.json()['model_preference'] == 'qwen2.5:3b'
    conversation_id = created.json()['id']

    monkeypatch.setattr(provider.ollama, 'generate_chat_with_model', AsyncMock(return_value='DBMS is a database management system.'))
    sent = client.post(f'/api/v1/chat/conversations/{conversation_id}/messages', headers=owner, json={
        'content': 'Explain DBMS', 'provider': 'ollama', 'model': 'qwen3:4b',
    })
    assert sent.status_code == 200, sent.text
    assert sent.json()['message']['provider_used'] == 'ollama'
    assert sent.json()['message']['model_used'] == 'qwen3:4b'
    assert provider.ollama.generate_chat_with_model.await_args.args[2] == 'qwen3:4b'

    detail = client.get(f'/api/v1/chat/conversations/{conversation_id}', headers=owner)
    assert [item['role'] for item in detail.json()['messages']] == ['user', 'assistant']
    assert client.get(f'/api/v1/chat/conversations/{conversation_id}', headers=other).status_code == 404


def test_chat_preserves_user_message_when_generation_fails(monkeypatch):
    client = TestClient(app, raise_server_exceptions=False)
    owner = register(client, 'chat_failure')
    created = client.post('/api/v1/chat/conversations', headers=owner, json={})
    conversation_id = created.json()['id']
    monkeypatch.setattr(provider.ollama, 'generate_chat_with_model', AsyncMock(side_effect=RuntimeError('provider failed')))
    response = client.post(f'/api/v1/chat/conversations/{conversation_id}/messages', headers=owner, json={
        'content': 'This should be retained', 'provider': 'ollama',
    })
    assert response.status_code == 500
    messages = client.get(f'/api/v1/chat/conversations/{conversation_id}', headers=owner).json()['messages']
    assert [item['content'] for item in messages] == ['This should be retained']

def test_chat_can_rename_owned_conversation():
    client = TestClient(app)
    owner = register(client, 'chat_rename')
    created = client.post('/api/v1/chat/conversations', headers=owner, json={})
    conversation_id = created.json()['id']
    renamed = client.patch(
        f'/api/v1/chat/conversations/{conversation_id}',
        headers=owner,
        json={'title': '  Data Structures  '},
    )
    assert renamed.status_code == 200
    assert renamed.json()['title'] == 'Data Structures'
    loaded = client.get(f'/api/v1/chat/conversations/{conversation_id}', headers=owner)
    assert loaded.json()['conversation']['title'] == 'Data Structures'
