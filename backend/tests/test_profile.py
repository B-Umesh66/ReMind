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
