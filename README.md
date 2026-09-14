# Barakah Finance POS
## বারাকাহ ফাইন্যান্স — Library & Stationery Business Management System

A production-ready, full-stack POS + Business Management System.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + React + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL 18 + Prisma ORM |
| Auth | JWT + Refresh Tokens + RBAC |
| Cache | Redis-ready |
| Deployment | Docker + Nginx |

---

## Quick Start (Development)

### Prerequisites
- Node.js >= 18
- PostgreSQL running on port 5432
- Database: `bf_pos` with user `postgres`

### 1. Setup Backend
```bash
cd apps/backend
npm install
# Configure .env (copy from .env.example)
npx prisma db push
npm run db:seed
npm run start:dev
```

### 2. Setup Frontend
```bash
cd apps/frontend
npm install
# Configure .env.local
npm run dev
```

---

## Default Credentials

| Field | Value |
|-------|-------|
| URL | http://localhost:3001/api/v1 |
| Docs | http://localhost:3001/api/docs |
| Username | admin |
| Password | Admin@123456 |

---

## Architecture

```
bf-pos/
├── apps/
│   ├── backend/          # NestJS API
│   │   ├── src/
│   │   │   ├── modules/  # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── products/
│   │   │   │   ├── sales/
│   │   │   │   ├── purchases/
│   │   │   │   ├── inventory/
│   │   │   │   ├── accounting/
│   │   │   │   ├── suppliers/
│   │   │   │   ├── customers/
│   │   │   │   └── settings/
│   │   │   ├── common/   # Guards, filters, decorators
│   │   │   ├── config/   # App configuration
│   │   │   └── prisma/   # Database service
│   │   └── prisma/
│   │       ├── schema.prisma  # 43 tables
│   │       └── seed.ts        # Demo data
│   └── frontend/         # Next.js app
│       └── src/
│           ├── app/      # App Router pages
│           ├── components/
│           ├── store/    # Zustand state
│           ├── lib/      # API client
│           └── hooks/
├── nginx/                # Reverse proxy config
└── docker-compose.yml    # Full stack deployment
```

---

## Database Tables (43)

- **Auth**: users, refresh_tokens, roles, permissions, user_roles, role_permissions
- **Organization**: branches, warehouses
- **Products**: products, product_variants, categories, brands, units, barcodes, product_stocks
- **Parties**: suppliers, customers, customer_groups
- **Transactions**: purchases, purchase_items, sales, sale_items
- **Payments**: customer_payments, supplier_payments, cash_registers, cash_movements
- **Inventory**: stock_movements, stock_adjustments, stock_adjustment_items, stock_counts, stock_count_items
- **Accounting**: accounts, journal_entries, journal_lines
- **Finance**: expenses, expense_categories, incomes, investments, investment_transactions
- **System**: notifications, audit_logs, settings, numbering_sequences

---

## API Endpoints

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/profile

GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
GET    /api/v1/products/barcode/:barcode
GET    /api/v1/products/low-stock

POST   /api/v1/sales
GET    /api/v1/sales
GET    /api/v1/sales/:id
POST   /api/v1/sales/:id/void

POST   /api/v1/purchases
GET    /api/v1/purchases
GET    /api/v1/purchases/:id

GET    /api/v1/suppliers
POST   /api/v1/suppliers

GET    /api/v1/customers
POST   /api/v1/customers

GET    /api/v1/users
POST   /api/v1/users

GET    /api/v1/settings
```

---

## Roles & Permissions

| Role | Access |
|------|--------|
| SUPER_ADMIN | Full system access |
| OWNER | Full business access |
| MANAGER | Branch management |
| CASHIER | POS sales only |
| INVENTORY_STAFF | Stock management |
| ACCOUNTANT | Financial records |
| VIEWER | Read-only |

---

## Docker Deployment

```bash
docker-compose up -d
```

Access at http://localhost (via Nginx reverse proxy)
