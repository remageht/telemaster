import sys
import os
from fastapi.testclient import TestClient

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app

def test_production_security_suite():
    with TestClient(app) as client:
        # 1. Healthz check
        hz = client.get("/healthz")
        assert hz.status_code == 200
        data = hz.json()
        assert data.get("status") == "ok"
        assert data.get("version") == "1.0.0"
        print("\n[OK] /healthz -> 200", data)

        # 2. 401 Unauthorized cases
        r401_no_token = client.get("/api/orders")
        assert r401_no_token.status_code == 401
        print("[OK] GET /api/orders without token -> 401 Unauthorized")

        r401_bad_token = client.get("/api/orders", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert r401_bad_token.status_code == 401
        print("[OK] GET /api/orders with invalid token -> 401 Unauthorized")

        r401_login = client.post("/api/auth/login", json={"phone": "admin", "password": "wrongpassword123"})
        assert r401_login.status_code == 401
        print("[OK] POST /api/auth/login with wrong password -> 401 Unauthorized")

        # 3. Register regular user (non-admin)
        reg = client.post("/api/auth/register", json={"phone": "+79789998877", "name": "Test User", "password": "password123"})
        if reg.status_code == 400 and "already registered" in reg.text:
            reg = client.post("/api/auth/login", json={"phone": "+79789998877", "password": "password123"})
        assert reg.status_code in [200, 201]
        user_tokens = reg.json()
        assert "access_token" in user_tokens
        assert "refresh_token" in user_tokens
        print("[OK] Register/Login regular user -> 200/201 with access+refresh tokens")

        # 4. 403 Forbidden case: regular authenticated user trying to access admin endpoint
        user_header = {"Authorization": f"Bearer {user_tokens['access_token']}"}
        r403 = client.get("/api/orders", headers=user_header)
        assert r403.status_code == 403
        assert "Admin privileges required" in r403.json().get("detail", "")
        print("[OK] GET /api/orders with non-admin token -> 403 Forbidden")

        # 5. Refresh token flow
        ref = client.post("/api/auth/refresh", json={"refresh_token": user_tokens["refresh_token"]})
        assert ref.status_code == 200
        new_tokens = ref.json()
        assert "access_token" in new_tokens
        assert "refresh_token" in new_tokens
        print("[OK] POST /api/auth/refresh -> 200 successfully refreshed tokens")

        # 6. Admin login and access
        admin_login = client.post("/api/auth/login", json={"phone": "admin", "password": "telemaster2026"})
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_header = {"Authorization": f"Bearer {admin_token}"}
        admin_orders = client.get("/api/orders", headers=admin_header)
        assert admin_orders.status_code == 200
        print("[OK] Admin login & GET /api/orders with admin token -> 200 OK")

        # 7. 429 Rate limiting case
        rate_limited = False
        for i in range(25):
            resp = client.get("/health")
            if resp.status_code == 429:
                rate_limited = True
                print(f"[OK] Rate limit triggered on request #{i+1} -> 429 Too Many Requests")
                break
        assert rate_limited, "Expected 429 Too Many Requests within 25 requests"

if __name__ == "__main__":
    test_production_security_suite()
    print("\nALL PRODUCTION SECURITY AND ENDPOINT TESTS PASSED SUCCESSFULLY!")
