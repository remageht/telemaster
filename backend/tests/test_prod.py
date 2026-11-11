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

        # 6.1 Server-side pricing: client totals/line prices are ignored
        import time
        test_pid = f"test-sec-{int(time.time())}"
        create_prod = client.post(
            "/api/products",
            json={"id": test_pid, "name": "Security Test Product", "sku": "SEC-TEST", "price": 1000, "stock": 5, "cat_id": "mcu"},
            headers=admin_header,
        )
        assert create_prod.status_code == 200, create_prod.text
        prod = create_prod.json()
        assert prod["stock"] == 5, prod
        order_payload = {
            "name": "Security Test",
            "phone": "+79780000000",
            "delivery": "pickup",
            "pay": "card",
            "items": 1,
            "subtotal": 1,
            "fee": 0,
            "total": 1,
            "discount": 99999,
            "promo": "TELE10",
            "lines": [{"id": prod["id"], "name": prod["name"], "price": 1, "qty": 1}],
        }
        order_res = client.post("/api/orders", json=order_payload)
        assert order_res.status_code == 201, order_res.text
        order = order_res.json()
        expected_discount = round(prod["price"] * 10 / 100)
        assert order["subtotal"] == prod["price"], order
        assert order["discount"] == expected_discount, order
        assert order["total"] == prod["price"] - expected_discount, order
        print("[OK] Client price/total/discount ignored -> server pricing applied")

        stock_after = next(p for p in client.get("/api/products").json() if p["id"] == test_pid)
        assert stock_after["stock"] == prod["stock"] - 1, stock_after
        print("[OK] Stock atomically decremented after order")

        bad_order = dict(order_payload)
        bad_order["lines"] = [{"id": "no-such-product", "name": "x", "price": 1, "qty": 1}]
        bad_res = client.post("/api/orders", json=bad_order)
        assert bad_res.status_code == 400, bad_res.text
        print("[OK] Unknown product in order -> 400")

        order_status = client.patch(f"/api/orders/{order['id']}", json={"status": "Отправлен"}, headers=admin_header)
        assert order_status.status_code == 200 and order_status.json()["status"] == "Отправлен"
        print("[OK] PATCH /api/orders/{id} status -> 200")

        # 6.2 Telegram relay requires admin, client text is escaped
        tg_anon = client.post("/api/telegram/send", json={"text": "spam"})
        assert tg_anon.status_code == 401, tg_anon.text
        print("[OK] POST /api/telegram/send without token -> 401")

        # 6.3 Products PUT ignores unknown/mass-assignment fields
        put_res = client.put(
            f"/api/products/{prod['id']}",
            json={"stock": prod["stock"], "hacker": True},
            headers=admin_header,
        )
        assert put_res.status_code == 200
        assert "hacker" not in put_res.json()
        print("[OK] PUT /api/products ignores mass-assignment fields")
        assert client.delete(f"/api/products/{prod['id']}", headers=admin_header).status_code == 200

        # 6.4 Leads: create -> done -> delete
        lead_res = client.post("/api/leads", json={"name": "Lead Test", "contact": "+79781112233", "channel": "site"})
        assert lead_res.status_code == 201, lead_res.text
        lead = lead_res.json()
        lead_patch = client.patch(f"/api/leads/{lead['id']}", json={"done": True}, headers=admin_header)
        assert lead_patch.status_code == 200 and lead_patch.json()["done"] is True
        lead_del = client.delete(f"/api/leads/{lead['id']}", headers=admin_header)
        assert lead_del.status_code == 200
        print("[OK] Leads create -> PATCH done -> DELETE")

        # 6.5 Token of a deleted user is rejected (no ghost sessions)
        from app.core.database import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        ghost = db.query(User).filter(User.phone == "+79789998877").first()
        if ghost:
            db.delete(ghost)
            db.commit()
        db.close()
        ghost_res = client.get("/api/orders", headers=user_header)
        assert ghost_res.status_code == 401, ghost_res.text
        print("[OK] Deleted user token -> 401 (no ghost session)")

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
