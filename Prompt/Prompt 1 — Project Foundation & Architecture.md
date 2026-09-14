You are the lead software architect and senior full-stack developer for this project.

We are building a production-ready web-based Business Management System for:

**Barakah Finance — Library & Stationery**

The business will sell:
- School books
- Madrasa books
- Islamic books
- Quran/Hadith books
- Stationery
- Notebooks
- Pens/Pencils
- Files/Folders
- Educational accessories
- Office supplies
- Other retail products

The final system must work as a complete:
**POS + Inventory + Purchase + Sales + Accounting + Investment + Customer + Supplier + Reporting + Business Management System.**

IMPORTANT:
Do NOT start by creating random UI screens.
First understand the entire system architecture and build a strong foundation.

Recommended stack:
- Frontend: Next.js + React + TypeScript
- UI: Tailwind CSS
- Backend/API: Node.js + TypeScript
- Backend architecture: NestJS or a clean modular API architecture
- Database: PostgreSQL
- ORM: Prisma
- Authentication: secure session/JWT architecture
- Validation: Zod/class-validator or equivalent
- Charts: Recharts/ECharts
- PDF: PDFKit or equivalent
- Excel: ExcelJS
- Cache: Redis-ready architecture
- Deployment: Docker + Nginx + Linux VPS
- Testing: unit + integration + E2E

Use the existing project structure if this project already contains code. Do not unnecessarily delete or rewrite working code.

TASKS:

1. Analyze the existing repository before making changes.
2. Create a clean production-ready architecture.
3. Set up the frontend.
4. Set up the backend/API.
5. Set up PostgreSQL and Prisma.
6. Create database migrations.
7. Create seed/demo data.
8. Create environment configuration and .env.example.
9. Create a modular folder structure.
10. Create centralized error handling.
11. Create centralized API response/error format.
12. Create request validation.
13. Create logging.
14. Create database transaction utilities.
15. Prepare the system for future multi-branch support.
16. Prepare the system for future mobile application/API consumption.

DATABASE FOUNDATION:

Create the initial database architecture for:

- users
- roles
- permissions
- user_roles
- branches
- warehouses
- products
- product_variants
- categories
- brands
- units
- barcodes
- suppliers
- customers
- purchases
- purchase_items
- sales
- sale_items
- sale_payments
- purchases/payments
- customer_payments
- supplier_payments
- inventory_movements
- stock_adjustments
- stock_counts
- expenses
- expense_categories
- incomes
- cash_registers
- cash_movements
- accounts
- journal_entries
- journal_lines
- investments
- investment_transactions
- notifications
- audit_logs
- settings
- numbering_sequences

IMPORTANT DATABASE RULES:

- Use UUID primary keys where appropriate.
- Use PostgreSQL NUMERIC/DECIMAL for money. NEVER use floating point for financial values.
- Use proper foreign keys.
- Add proper indexes.
- Add unique constraints for SKU/barcode/invoice numbers where required.
- Store timestamps consistently.
- Historical financial transactions must never be hard-deleted.
- Use void/reversal architecture where appropriate.
- Keep financial and inventory operations transaction-safe.
- Prepare for concurrent users.

ACCOUNTING FOUNDATION:

Prepare a double-entry accounting layer.

Examples:

Inventory purchase:
Inventory Dr
Cash/Bank/Payable Cr

Cash sale:
Cash Dr
Sales Revenue Cr

Credit sale:
Accounts Receivable Dr
Sales Revenue Cr

COGS:
COGS Dr
Inventory Cr

Expense:
Expense Dr
Cash/Bank Cr

Customer payment:
Cash/Bank Dr
Accounts Receivable Cr

Supplier payment:
Accounts Payable Dr
Cash/Bank Cr

Investment:
Cash/Bank Dr
Capital/Investment Cr

Do NOT implement fake accounting logic just for display.

INVENTORY FOUNDATION:

Create a stock movement architecture.

Movement types must support:

OPENING_STOCK
PURCHASE
SALE
SALES_RETURN
PURCHASE_RETURN
DAMAGE
LOST
ADJUSTMENT_IN
ADJUSTMENT_OUT
TRANSFER_IN
TRANSFER_OUT

Do not rely only on a simple current_stock field.

SECURITY:

Prepare:
- Authentication
- Authorization
- RBAC
- Password hashing
- Secure sessions/tokens
- Audit logging
- Rate limiting-ready architecture
- Server-side permission checks

ROLES:

Owner/Super Admin
Manager
Cashier
Inventory Staff
Accountant
Viewer

At the end:

- Run migrations.
- Run seed.
- Start the project.
- Fix all compilation/runtime errors.
- Verify frontend/backend/database connectivity.
- Give me a concise summary of what you created.
- Do not stop at planning. Actually implement the foundation.