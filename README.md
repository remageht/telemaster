# ТЕЛЕМАСТЕР — магазин радиокомпонентов (Production Ready)

Одностраничный магазин электронных и радиокомпонентов с PWA-оффлайн поддержкой и асинхронным бэкендом на FastAPI. Чистый HTML/CSS/JS без утяжеляющих сборщиков на фронтенде и масштабируемый API бэкенд с защитой данных.

> **Production / Hybrid Mode · Локальный оффлайн-кэш + FastAPI REST API · JWT Auth · Docker**

## Стек технологий

- **Frontend**: HTML5, CSS3, Vanilla JS (ES6+), PWA (`sw.js` с версионированием CACHE `tm-v91`), Service Worker оффлайн-кэш, адаптивный дизайн (480px+), конфигурация рантайма `window.__CONFIG__.API_BASE`.
- **Backend**: Python 3.12+, FastAPI, SQLAlchemy 2.0 (SQLite / PostgreSQL), Uvicorn.
- **Безопасность**: JWT (access 15 мин + refresh 7 дней), bcrypt хеширование, `require_admin` (401/403), slowapi rate limiting (20 запросов/мин на IP, 429), валидация окружения pydantic-settings, маскирование PII, generic 500 error handler, CORS из `.env`.
- **DevOps**: Docker (`python:3.12-slim` non-root `appuser`, `nginx:alpine`), `docker-compose.yml`, healthcheck `/healthz`, GitHub Actions CI.

## Возможности

- Каталог (6 категорий, 30+ товаров), фильтр, поиск, сортировка, переключение сетка/таблица
- Корзина + оптовая скидка −25% от 10 шт, промокоды (`TELE10`)
- Оформление: самовывоз / курьер / доставка по Крыму (от 3000 ₽ бесплатно)
- Личный кабинет: заказы, избранное, бонусы, история просмотров
- JWT Админка: управление товарами (CRUD), модерация отзывов, просмотр заказов и лидов
- Уведомления в Telegram через серверный прокси без утечки токена бота
- PWA (`sw.js` + `manifest.json`), темная тема Dala и светлая тема

## Версии проекта

| Версия | Дата | Ключевая фича | Ссылка на Release |
|---|---|---|---|
| [v0.60](https://github.com/remageht/telemaster/releases/tag/v0.60) | 23.09.2026 | Адаптивная верстка (480 px) и CSP | [Release v0.60](https://github.com/remageht/telemaster/releases/tag/v0.60) |
| [v0.65](https://github.com/remageht/telemaster/releases/tag/v0.65) | 23.09.2026 | XSS‑защита (esc, escAttr, sanitizeImgSrc) | [Release v0.65](https://github.com/remageht/telemaster/releases/tag/v0.65) |
| [v0.66](https://github.com/remageht/telemaster/releases/tag/v0.66) | 24.09.2026 | Hybrid orders & leads (API → localStorage) | [Release v0.66](https://github.com/remageht/telemaster/releases/tag/v0.66) |
| [v0.67](https://github.com/remageht/telemaster/releases/tag/v0.67) | 24.09.2026 | JWT‑админка (is_admin, TTL) | [Release v0.67](https://github.com/remageht/telemaster/releases/tag/v0.67) |
| [v0.68](https://github.com/remageht/telemaster/releases/tag/v0.68) | 24.09.2026 | Products CRUD + getProducts кэш | [Release v0.68](https://github.com/remageht/telemaster/releases/tag/v0.68) |
| [v0.69](https://github.com/remageht/telemaster/releases/tag/v0.69) | 24.09.2026 | Серверный subtotal/fee/total + проверка stock | [Release v0.69](https://github.com/remageht/telemaster/releases/tag/v0.69) |
| [v0.70](https://github.com/remageht/telemaster/releases/tag/v0.70) | 24.09.2026 | Stage 6 cleanup (удалил hash‑fallback, telegram‑proxy) | [Release v0.70](https://github.com/remageht/telemaster/releases/tag/v0.70) |
| [v1.0.0](https://github.com/remageht/telemaster/releases/tag/v1.0.0) | 24.09.2026 | Hybrid prod + Dockerfile | [Release v1.0.0](https://github.com/remageht/telemaster/releases/tag/v1.0.0) |

## Запуск в продакшене (Docker Compose)

```bash
# 1. Склонировать и скопировать переменные окружения
cp .env.example .env

# 2. Собрать и запустить контейнеры в фоне
docker compose up --build -d

# 3. Проверить статус контейнеров и healthcheck
docker compose ps

# 4. Проверить healthcheck эндпоинт
curl http://localhost:8000/healthz

# Фронтенд доступен на: http://localhost:8080
# API бэкенда доступен на: http://localhost:8000
```

## Локальная разработка

```bash
# Запуск бэкенда
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Запуск статического фронтенда (в отдельном терминале)
cd ..
python -m http.server 8080
```

## Чеклист безопасности (Hardening)

- [x] **Secrets in ENV**: Секретные ключи (`SECRET_KEY`, `TELEGRAM_BOT_TOKEN`) задаются строго через переменные окружения, реализована валидация минимальной длины.
- [x] **JWT Access + Refresh**: Access-токен (15 минут) для авторизации запросов, Refresh-токен (7 дней) для обновления через `/api/auth/refresh`.
- [x] **RBAC / require_admin**: Разделение прав: 401 Unauthorized при отсутствии/невалидности токена, 403 Forbidden при попытке доступа обычного пользователя к админским маршрутам.
- [x] **Password Security**: Хеширование паролей алгоритмом bcrypt (salt + work factor).
- [x] **Rate Limiting**: Защита от брутфорса и перегрузки через `slowapi` (лимит 20 запросов/мин на IP, ответ HTTP 429 Too Many Requests).
- [x] **Strict Pydantic**: Строгая валидация полей моделей с ограничениями длины, диапазонов чисел и форматов.
- [x] **CORS Isolation**: Список разрешенных доменов конфигурируется через `CORS_ORIGINS`.
- [x] **PII Masking**: Номера телефонов и контакты маскируются при логировании операций.
- [x] **Generic 500 Handler**: Отлов необработанных исключений без утечки внутренних стектрейсов и структуры БД.
- [x] **Non-Root Docker**: Контейнер бэкенда запускается из-под непривилегированного пользователя `appuser`.

## Структура проекта

```
index.html              Лендинг, модальные окна, динамический роутинг
css/style.css           Светлая/Dala темы, адаптивные стили (480px+)
js/config.js            Конфигурация window.__CONFIG__.API_BASE
js/data.js              Каталог по умолчанию и SVG ассеты
js/main.js              Маршрутизатор, корзина, заказы, гибридный клиент API
js/constellation.js     3D Canvas созвездия и модели
js/circuit-bg.js        Интерактивный фон печатной платы
sw.js                   PWA Service Worker (CACHE tm-v91)
nginx.conf              Конфигурация Nginx (security headers, gzip, proxy)
Dockerfile.backend      Multi-stage/slim образ бэкенда (non-root)
Dockerfile.frontend     Nginx Alpine образ статики
docker-compose.yml      Оркестрация frontend + api
.github/workflows/ci.yml CI пайплайн (линтер, тесты, сборка Docker)
backend/
  app/
    api/                Эндпоинты (auth, orders, leads, products, telegram)
    core/               Конфигурация, безопасность (JWT, bcrypt), база данных
    models/             SQLAlchemy модели (User, Product, Order, Lead)
    schemas/            Pydantic схемы валидации
    main.py             FastAPI приложение, middleware, rate-limiter, healthz
  tests/
    test_prod.py        Набор тестов безопасности (healthz, 401, 403, 429, refresh)
  requirements.txt      Зависимости Python
```

## Тестирование безопасности

Запуск набора тестов безопасности (healthz, 401, 403, 429, refresh-токен):

```bash
python backend/tests/test_prod.py
```

## Лицензия

Демо-код — как есть, для портфолио/обучения.
