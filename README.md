# Barakah Finance POS
## Barakah Finance -- Library & Stationery Business Management System
## Barakat Finance -- Laibrari O Stationari Byabsha Byabsthapanar System

A production-ready, full-stack POS + Business Management System
built with Next.js, NestJS, PostgreSQL, and Prisma.

---

## Tech Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Frontend   | Next.js 14 + React + TypeScript + Tailwind  |
| Backend    | NestJS + TypeScript                         |
| Database   | PostgreSQL 18 + Prisma ORM                  |
| Auth       | JWT + Refresh Tokens + RBAC                 |
| Cache      | Redis (ioredis) + in-memory fallback        |
| Deployment | Docker + Nginx                              |

---

## Quick Start (Development)

### Prerequisites
- Node.js >= 18
- PostgreSQL running on port 5432
- Redis (optional -- in-memory fallback used if unavailable)

### 1. Setup Backend
```bash
cd apps/backend
npm install
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET etc.
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

### 2. Setup Frontend
```bash
cd apps/frontend
npm install
cp .env.local.example .env.local
npm run dev
```

---

## Default Credentials

| Field     | Value                       |
|-----------|-----------------------------|
| URL       | http://localhost:3001/api/v1|
| Docs      | http://localhost:3001/api/docs|
| Username  | admin                       |
| Password  | Admin@123456                |

---

## Project Structure

```
bf-pos/
+-- apps/
|   +-- backend/          # NestJS API
|   |   +-- src/
|   |   |   +-- modules/  # Feature modules
|   |   |   |   +-- auth/
|   |   |   |   +-- users/
|   |   |   |   +-- products/
|   |   |   |   +-- sales/         # POS + stock check + accounting
|   |   |   |   +-- purchases/
|   |   |   |   +-- inventory/     # Stock movement engine
|   |   |   |   +-- accounting/    # Double-entry journal
|   |   |   |   +-- cache/         # Redis + memory fallback
|   |   |   |   +-- health/        # /api/v1/health endpoint
|   |   |   +-- common/   # Guards, filters, decorators
|   |   |   +-- config/
|   |   |   +-- prisma/
|   |   +-- prisma/
|   |       +-- schema.prisma  # 43 tables
|   |       +-- migrations/    # SQL migration history
|   |       +-- seed.ts
|   +-- frontend/         # Next.js 14 App Router
|       +-- src/
|           +-- app/      # Pages (login, dashboard, pos, ...)
|           +-- components/
|           +-- store/    # Zustand auth store
|           +-- lib/      # axios API client
+-- nginx/
+-- docker-compose.yml
+-- README.md
```

---

## Database Tables (43)

- **Auth**: users, refresh_tokens, roles, permissions, user_roles, role_permissions
- **Org**: branches, warehouses
- **Products**: products, product_variants, categories, brands, units, barcodes, product_stocks
- **Parties**: suppliers, customers, customer_groups
- **Transactions**: purchases, purchase_items, sales, sale_items
- **Payments**: customer_payments, supplier_payments, cash_registers, cash_movements
- **Inventory**: stock_movements, stock_adjustments, stock_adjustment_items, stock_counts, stock_count_items
- **Accounting**: accounts (chart), journal_entries, journal_lines
- **Finance**: expenses, expense_categories, incomes, investments, investment_transactions
- **System**: notifications, audit_logs, settings, numbering_sequences

---

## Key Business Rules

- **Negative stock blocked** by default (`allow_negative_stock = false` in settings)
- **Double-entry accounting** on every sale, purchase, payment
- **All financial amounts** use DECIMAL(15,2) -- no floating point
- **Void/reversal** architecture -- historical transactions never hard-deleted
- **FOR UPDATE lock** on stock rows during sale transaction (concurrent-safe)

---

## API Endpoints (selected)

```
POST   /api/v1/auth/login
GET    /api/v1/health

GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/barcode/:barcode
GET    /api/v1/products/low-stock

POST   /api/v1/sales
GET    /api/v1/sales
POST   /api/v1/sales/:id/void

POST   /api/v1/purchases
GET    /api/v1/purchases

GET    /api/v1/suppliers
GET    /api/v1/customers
GET    /api/v1/settings
```

---

## Roles

| Role            | Access level                  |
|-----------------|-------------------------------|
| SUPER_ADMIN     | Full system                   |
| OWNER           | Full business                 |
| MANAGER         | Branch + reports              |
| CASHIER         | POS sales only                |
| INVENTORY_STAFF | Stock management              |
| ACCOUNTANT      | Financial records             |
| VIEWER          | Read-only                     |

---

## Docker Deployment

```bash
# Start all services
docker compose up -d

# Check health
docker compose ps
curl http://localhost/api/v1/health
```

Access at http://localhost (via Nginx reverse proxy)
