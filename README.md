# Badem CRM API

NestJS + TypeORM + PostgreSQL backend for the Badem CRM: users, employees,
suppliers, sources (raw-material stock), clients and products — with JWT
access/refresh authentication.

The central rule: **producing a product consumes its source.** Every change of
stock is written to an append-only source history.

## Quick start

```bash
npm install
cp .env.example .env          # adjust DB credentials if needed
docker compose up -d postgres # or point .env at your own PostgreSQL
npm run seed                  # creates the schema + admin + demo data
npm run start:dev
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs
- Seeded admin: `admin@badem.local` / `Admin123!` (change via `SEED_ADMIN_*` in `.env`)

`DB_SYNCHRONIZE=true` builds the schema from the entities on boot, which is
handy in development. Turn it off in production and use migrations
(`npm run migration:generate -- src/database/migrations/Init`, then
`npm run migration:run`).

## Data model

```
Supplier 1 ──── n Source 1 ──── n SourceHistory
                   │                    ▲
                   │ consumed by        │ one row per stock movement
                   n                    │
Client 1 ──── n Product ────────────────┘

User 1 ──── 0..1 Employee
```

| Table              | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `users`            | Login accounts: email, password hash, role, refresh-token hash       |
| `employees`        | Staff records, optionally linked to a `users` row                    |
| `suppliers`        | Who raw materials are bought from                                    |
| `sources`          | Raw material stock; **belongs to a supplier**                        |
| `source_histories` | Append-only ledger of every stock movement                           |
| `clients`          | Customers                                                            |
| `products`         | Produced goods; **belong to a client**, consume a source             |

Every table has a uuid `id`, `createdAt`, `updatedAt` and a `deletedAt` soft-delete column.

## Stock rules

`Product.totalSourceUsed = quantity × sourceUsage` (`sourceUsage` defaults to 1,
so a plain `quantity` behaves as "one product unit eats one source unit").

| Action                     | Effect on `sources.quantity` | History entry |
| -------------------------- | ---------------------------- | ------------- |
| `POST /products`           | −`totalSourceUsed`           | `PRODUCTION`  |
| `PATCH /products/:id`      | re-settles the difference    | `PRODUCTION` / `RETURN` |
| `DELETE /products/:id`     | +`totalSourceUsed` returned  | `RETURN`      |
| `POST /sources/:id/restock`| +`quantity`                  | `RESTOCK`     |
| `POST /sources/:id/adjust` | set to an absolute value     | `ADJUSTMENT`  |

Guarantees:

- Stock can never go negative — an oversell returns **409 Conflict** and nothing is written.
- Product + stock change + history row happen in **one transaction**, so a failure leaves no half-finished product.
- The source row is locked `FOR UPDATE` while it is being changed, so two simultaneous productions cannot both spend the same stock.
- `sources.quantity` is not editable through `PATCH /sources/:id`; it only moves through the operations above, which keeps the history complete.

## Authentication

`POST /auth/login` returns both tokens:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

- Send the **access** token as `Authorization: Bearer <token>` on every request (default lifetime 15m).
- When it expires, call `POST /auth/refresh` with the **refresh** token in the same header (default lifetime 7d).
- Refresh tokens are **rotated**: each refresh issues a new pair and invalidates the old one. Presenting an already-used refresh token drops the whole session, which is the standard reuse-detection response to a stolen token.
- Only a SHA-256 hash of the current refresh token is stored. (Not bcrypt: bcrypt reads only the first 72 bytes, and two JWTs for the same user are identical that far in — bcrypt would keep accepting old tokens.)
- `POST /auth/logout` clears the stored hash.

Every route requires a valid access token unless marked `@Public()` — that is
only `register`, `login` and `refresh`.

### Roles

`ADMIN` > `MANAGER` > `EMPLOYEE` (self-registration always gives `EMPLOYEE`; only an admin can promote via `PATCH /users/:id`).

- **ADMIN** — everything, including user management and deletes.
- **MANAGER** — manages employees, suppliers, sources, clients, products.
- **EMPLOYEE** — reads the catalogue and creates/updates products (i.e. records production).

## Endpoints

| Method   | Path                        | Role            |
| -------- | --------------------------- | --------------- |
| POST     | `/auth/register`            | public          |
| POST     | `/auth/login`               | public          |
| POST     | `/auth/refresh`             | refresh token   |
| POST     | `/auth/logout`              | any             |
| GET      | `/auth/me`                  | any             |
| CRUD     | `/users`                    | ADMIN (list: +MANAGER) |
| PATCH    | `/users/me/password`        | any             |
| CRUD     | `/employees`                | ADMIN, MANAGER  |
| CRUD     | `/suppliers`                | ADMIN, MANAGER (read: any) |
| CRUD     | `/sources`                  | ADMIN, MANAGER (read: any) |
| POST     | `/sources/:id/restock`      | ADMIN, MANAGER  |
| POST     | `/sources/:id/adjust`       | ADMIN, MANAGER  |
| GET      | `/sources/:id/history`      | any             |
| GET      | `/source-history`           | any             |
| CRUD     | `/clients`                  | ADMIN, MANAGER (read: any) |
| CRUD     | `/products`                 | any (delete: ADMIN, MANAGER) |

List endpoints accept `?page=&limit=&search=` and return `{ data, meta }`.
Extra filters: sources — `supplierId`, `lowStock`, `isActive`; products —
`clientId`, `sourceId`; source history — `sourceId`, `productId`, `action`, `from`, `to`.

### Example: produce a product

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"name":"Roasted almond 500g","quantity":200,"sourceUsage":0.5,"price":65000,"clientId":"<client-uuid>","sourceId":"<source-uuid>"}'
```

With 1000 kg in stock this takes 200 × 0.5 = 100 kg, leaves 900 kg, and writes a
`PRODUCTION` history row (`quantityBefore: 1000`, `quantityChange: -100`,
`quantityAfter: 900`) linked to the product and the user who did it.

## Scripts

| Command                     | What it does                                  |
| --------------------------- | --------------------------------------------- |
| `npm run start:dev`         | Watch mode                                    |
| `npm run build`             | Compile to `dist/`                            |
| `npm run start:prod`        | Run the compiled build                        |
| `npm run seed`              | Schema + admin + demo supplier/source/client  |
| `npm run migration:generate`| Generate a migration from entity changes      |
| `npm run migration:run`     | Apply migrations                              |
| `scripts/smoke-test.ps1`    | End-to-end check of auth + the stock flow against a running, seeded API |

## Frontend

[../badem-web](../badem-web) is an Angular 21 client for this API (signal forms,
zoneless). Start this API first, then `npm start` in that folder.

## Notes

- `DB_POOL_MAX` (default 10) sizes the connection pool. Set it to `1` if the database accepts only one connection at a time, so requests queue instead of failing.
- A failed user lookup during token validation is **not** treated as a 401 — only a genuinely missing or disabled account is. Otherwise a database hiccup would look like an expired session and log everyone out.
- **TypeScript is pinned to v6.** The Nest CLI needs the programmatic compiler API, which TypeScript 7.0 does not ship (it is expected back in 7.1). Do not upgrade to 7.x until the CLI supports it.
- uuid defaults use `gen_random_uuid()` (`uuidExtension: 'pgcrypto'`), which is core PostgreSQL since v13 — no `uuid-ossp` needed.
- `numeric` columns are mapped to JS numbers by a value transformer, so stock arithmetic never runs on strings.
- Password hashes and refresh-token hashes are never selected by default and are `@Exclude()`d from responses.
