import uuid
from fastapi.testclient import TestClient
from app.main import app

def test_auth_profile_and_password_flow():
    client = TestClient(app)
    # Register a unique test user
    uid = uuid.uuid4().hex[:8]
    email = f"profile_test_{uid}@example.com"
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test me
    r_me = client.get("/api/v1/auth/me", headers=headers)
    assert r_me.status_code == 200
    user_data = r_me.json()
    assert user_data["email"] == email
    assert "workspace_name" in user_data

    # Test update profile
    r_prof = client.put(
        "/api/v1/auth/profile",
        headers=headers,
        json={"display_name": "Dr. Learner", "workspace_name": "Neuroscience Lab"}
    )
    assert r_prof.status_code == 200
    updated = r_prof.json()
    assert updated["display_name"] == "Dr. Learner"
    assert updated["workspace_name"] == "Neuroscience Lab"

    # Test wrong current password
    r_pw_fail = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "wrongpassword", "new_password": "newsecretpassword456"}
    )
    assert r_pw_fail.status_code == 400

    # Test valid change password
    r_pw_ok = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "password123", "new_password": "newsecretpassword456"}
    )
    assert r_pw_ok.status_code == 200

    # Verify login with new password works
    r_new_login = client.post("/api/v1/auth/login", json={"email": email, "password": "newsecretpassword456"})
    assert r_new_login.status_code == 200

def test_delete_user_account_flow():
    client = TestClient(app)
    uid = uuid.uuid4().hex[:8]
    email = f"delete_test_{uid}@example.com"
    password = "password123"

    # Register
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200
    token = r.json()["access_token"]
    user_id = r.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload a test document
    files = {"file": ("test.txt", b"# Introduction to Cognitive Psychology\n\nMemory decay is natural.", "text/plain")}
    r_up = client.post("/api/v1/documents", headers=headers, files=files)
    assert r_up.status_code == 200

    # Verify document exists
    r_docs = client.get("/api/v1/documents", headers=headers)
    assert r_docs.status_code == 200
    assert len(r_docs.json()) >= 1

    # Attempt delete with wrong password
    r_del_fail = client.request("DELETE", "/api/v1/auth/account", headers=headers, json={"password": "wrongpassword"})
    assert r_del_fail.status_code == 400

    # Delete with correct password
    r_del = client.request("DELETE", "/api/v1/auth/account", headers=headers, json={"password": password})
    assert r_del.status_code == 200
    assert "deleted" in r_del.json()["message"].lower()

    # Verify user can no longer log in
    r_login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r_login.status_code == 401

    # Verify old token is rejected
    r_me = client.get("/api/v1/auth/me", headers=headers)
    assert r_me.status_code == 401

