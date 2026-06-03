# Zero — Backend API

Node + Express + TypeScript + Knex + PostgreSQL.

## Setup
```bash
cp .env.example .env      # fill JWT_SECRET, MSG91, PayU keys
npm install
npm run migrate           # create tables
npm run seed              # admin user + sample catalog
npm run dev               # http://localhost:4000/api/v1
```

Postgres comes from the repo-root `docker compose up -d`.

## Seeded data
- **Admin:** phone `9999900000` (login via OTP → printed in console in dev)
- Service pincodes `110001`, `110002`; 5 categories, 10 products, 2 banners.

## Auth
Phone OTP → JWT (Bearer). In dev (`OTP_DEV_MODE=true`) the OTP is logged to the console.
New phone numbers are auto-created as `customer` on first verify (signup). Admin role is set in DB/seed.

## API (prefix `/api/v1`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/otp/request` | – | Send OTP `{ phone }` |
| POST | `/auth/otp/verify` | – | Verify `{ phone, code, name?, language? }` → `{ token, user }` |
| GET  | `/auth/me` | user | Current user |
| PATCH| `/auth/me` | user | Update name/email/language |
| GET  | `/catalog/home` | – | Settings + banners + categories |
| GET  | `/catalog/categories` | – | Categories |
| GET  | `/catalog/products` | – | `?category=&search=&page=&limit=` |
| GET  | `/catalog/products/:idOrSlug` | – | One product |
| GET  | `/serviceability/check?pincode=` | – | Is pincode deliverable |
| GET/POST/PUT/DELETE | `/addresses` | user | Address book |
| GET  | `/cart` | user | Cart + totals |
| POST | `/cart/items` | user | Add `{ product_id, quantity }` |
| PUT  | `/cart/items` | user | Set qty (0 removes) |
| DELETE | `/cart/items/:productId` | user | Remove |
| POST | `/orders` | user | Place `{ address_id, payment_method }` |
| GET  | `/orders` / `/orders/:id` | user | List / detail |
| POST | `/orders/:id/cancel` | user | Cancel (if pending/confirmed) |
| POST | `/payments/payu/initiate` | user | `{ order_id }` → PayU form params |
| GET/POST | `/payments/payu/callback` | – | PayU redirect → verifies hash, deep-links app |
| `/admin/*` | | admin | Dashboard, products, categories, orders, users, banners, service-areas, settings |

All responses: `{ success, message, data }`. `message` is localized via `x-lang` / `Accept-Language` (`en`/`hi`).

## Multilingual content
`products.name`, `description`, `categories.name`, `banners.title` are JSONB `{ en, hi }`.
The API localizes them to a string based on the request language; the admin API returns the raw object for editing.

## Project layout
```
src/
├── config/        env, db (knex)
├── middleware/    locale, auth, validate, error
├── i18n/          en.json, hi.json, t()/localizeField()
├── services/      sms (MSG91), payu, settings
├── modules/       auth, catalog, cart, orders, addresses,
│                  serviceability, payments, admin
├── utils/         ApiError, http (ok/asyncHandler), jwt
├── app.ts         express wiring
└── server.ts      bootstrap
migrations/  seeds/
```
# zero-mart-backend
