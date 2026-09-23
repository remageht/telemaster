# ТЕЛЕМАСТЕР — демо-магазин радиокомпонентов

Демонстрационный одностраничный магазин электронных и радиокомпонентов. Чистый HTML/CSS/JS без сборки — данные в `localStorage`, оплата и доставка — заглушки.

> **Демо-версия · данные хранятся в `localStorage` · без бэкенда**

## Возможности

- Каталог (6 категорий, 30 товаров), фильтр, поиск, сортировка, вид сетка/таблица
- Корзина + опт −25% от 10 шт, промокоды (`TELE10`)
- Оформление: самовывоз / курьер / по Крыму (от 3000 ₽ бесплатно)
- Личный кабинет: заказы, избранное, бонусы, недавно смотрели
- Админка `#/admin` (демо-пароль `telemaster2026` → hash + 30 мин TTL, баннер о небезопасности)
- Отзывы с модерацией, CSV-выгрузка, Telegram-уведомления (токен — `DEMO`, прокси нужен в проде)
- PWA (`sw.js` + `manifest.json`), две темы (light / Dala)

## Быстрый старт

```bash
# любой статический сервер
python -m http.server 8080
# → http://localhost:8080
# или
npx serve .
```

Открой `index.html` напрямую — тоже работает (кроме PWA).

## Структура

```
index.html          лендинг + модалка + <main id="pageMain">
css/style.css       светлая/Dala темы, адаптив
js/data.js          CATALOG (30 позиций) + ART (21 SVG)
js/main.js          IIFE: роутер (#/catalog, #/product/id, #/cart, #/checkout, #/cabinet, #/admin), корзина, auth
js/constellation.js Dala-созвездия, 3D-модели, лампа, Крым
js/circuit-bg.js    фон-платы, js/pcb-field.js поле void
sw.js               оффлайн + версионирование CACHE tm-v81
```

## Роуты

`#/` `#/catalog` `#/category/<id>` `#/product/<id>` `#/search/<q>` `#/cart` `#/checkout` `#/cabinet` `#/admin`

## Примечания для продакшена

- Админка и Telegram — клиентские заглушки. В проде: `POST /api/admin/login → JWT`, `POST /api/telegram/send` (токен в `.env` на сервере).
- `localStorage` ключи: `tm-users` (SHA-256), `tm-cart`, `tm-orders`, `tm-fav`, `tm-reviews`, `tm-settings`, `tm-promos`.
- Версии: `?v=` в `index.html` ↔ `ASSETS` в `sw.js` + `CACHE`.

## Лицензия

Демо-код — как есть, для портфолио/обучения.
