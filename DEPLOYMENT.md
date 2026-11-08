# Інструкція з розгортання системи LogicForge Studio (Безкоштовні хмарні тарифи)

Цей посібник описує повний цикл розгортання клієнт-серверної системи **LogicForge Studio** у хмарі на безкоштовних тарифах (**Vercel** для React-клієнта + **Render.com** для Node.js/Express API + **Render PostgreSQL** або **Neon.tech Serverless PostgreSQL** для реляційної бази даних).

---

## Варіант А: Хмарний деплой (Vercel + Render.com + PostgreSQL) — 0 $/міс

### Крок 1. Публікація Git-репозиторію на GitHub

1. Створіть новий порожній репозиторій на GitHub (наприклад, `logicforge-studio`).
2. Прив'яжіть локальний репозиторій і відправте гілку `main`:

```bash
cd logicforge
git remote add origin https://github.com/<ВАШ_ЛОГІН>/logicforge-studio.git
git push -u origin main
```

---

### Крок 2. Розгортання бази даних PostgreSQL та Backend API на Render.com

У корені проєкту вже створено файл інфраструктури **`render.yaml`** (Render Blueprint), який автоматично піднімає і безкоштовну БД PostgreSQL, і Node.js сервер!

#### Автоматичний спосіб (через Blueprint — рекомендовано):

1. Увійдіть на [https://dashboard.render.com](https://dashboard.render.com) через GitHub.
2. Натисніть **New +** -> **Blueprint**.
3. Оберіть репозиторій `logicforge-studio`.
4. Render автоматично прочитає `render.yaml`, створить:
   - СУБД **PostgreSQL** (`logicforge-postgres`, тариф `Free`);
   - Веб-сервіс **Node.js** (`logicforge-api`, тариф `Free`), передасть йому `DATABASE_URL` та згенерує `JWT_SECRET`.
5. У полі `CORS_ORIGIN` вкажіть `*` (або після створення клієнта на Vercel замініть на ваш домен `https://logicforge-studio.vercel.app`).
6. Під час старту Render автоматично виконає міграції Prisma (`npx prisma migrate deploy`), заповнить демонстраційні схеми (`npm run db:seed`) та запустить сервер.
7. Скопіюйте отриману URL-адресу API, наприклад:
   `https://logicforge-api.onrender.com` (перевірте у браузері `https://logicforge-api.onrender.com/api/health`).

> **Порада щодо безлімітної бази даних PostgreSQL (Neon.tech):**
> Оскільки безкоштовна БД на Render діє 30–90 днів, для постійного безкоштовного зберігання можна створити безкоштовний проєкт на [https://neon.tech](https://neon.tech) (Free Tier 0.5 GB назавжди) та вставити отриманий рядок підключення `postgresql://...` у змінну `DATABASE_URL` на Render.com.

---

### Крок 3. Розгортання Frontend-додатку на Vercel

У корені репозиторію вже налаштовано файл **`vercel.json`** із командою збірки монорепозиторію та SPA-перенаправленнями для `react-router-dom`.

1. Увійдіть на [https://vercel.com](https://vercel.com) через GitHub.
2. Натисніть **Add New...** -> **Project** та імпортуйте репозиторій `logicforge-studio`.
3. Залиште **Root Directory** кореневим (`./`) — Vercel автоматично підхопить налаштування з `vercel.json`:
   - **Build Command**: `npm run build -w @logicforge/shared-types && npm run build -w @logicforge/client`
   - **Output Directory**: `client/dist`
4. Розгорніть секцію **Environment Variables** та додайте одну змінну:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://logicforge-api.onrender.com/api` _(ваш URL бекенду з Кроку 2 + суфікс `/api`)_
5. Натисніть **Deploy**. За 40–60 секунд ви отримаєте публічне HTTPS-посилання виду `https://logicforge-studio.vercel.app`.
6. (Опційно) Оновіть змінну `CORS_ORIGIN` у панелі Render.com на `https://logicforge-studio.vercel.app` для суворого захисту CORS.

---

## Варіант Б: Локальне контейнерне розгортання через Docker Compose

Якщо на сервері або робочій станції встановлено Docker Engine:

```bash
cd logicforge
docker compose up --build -d
```

Сервіси:

- **PostgreSQL 16**: порт `5432` (том `pgdata` зберігає всі схеми та ревізії між перезапусками)
- **Backend REST API**: `http://localhost:4000/api/health`
- **Frontend Nginx SPA**: `http://localhost:8080`
