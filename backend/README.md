# ТЕЛЕМАСТЕР Backend — Этап 0 (скелет)

Hybrid-подход: фронт пробует `USE_API=true`, при ошибке — `localStorage`.

## Запуск

```bash
cd backend
py -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # заполни SECRET_KEY
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs
# → http://localhost:8000/health
```

CORS разрешён для `http://localhost:8080` (фронт `py -m http.server 8080`).

## Структура

```
backend/
  app/
    main.py
    core/config.py
    core/security.py  # JWT, hash
    core/database.py
    models/{user,product,order,lead}.py
    schemas/{user,product,order,lead}.py
    api/{auth,orders,leads,products,telegram}.py
```

Этап 0 — только скелет: JWT-заготовка, базовые роуты-заглушки, `init_db()` создаёт SQLite.
Фронтенд не изменён.
