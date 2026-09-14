This is the final production-readiness phase of the Barakah Finance Library & Stationery Business Management System.

Do not start a new project.

Inspect the entire existing repository and verify that all previous requirements are actually implemented.

Your job is now:

**Senior QA Engineer + Security Engineer + Database Engineer + DevOps Engineer + Lead Developer.**

FULL SYSTEM AUDIT:

Verify these modules:

1. Authentication
2. Super Admin
3. Admin
4. Users
5. Roles
6. Permissions
7. Products
8. Categories
9. Brands
10. Units
11. SKU
12. Barcode
13. Barcode printing
14. Suppliers
15. Purchases
16. Purchase receiving
17. Purchase returns
18. Inventory
19. Stock movement
20. Stock count
21. Stock adjustment
22. Sales/POS
23. Barcode sales
24. Customers
25. Customer due
26. Sales returns
27. Cash register
28. Expenses
29. Income
30. Investment
31. Accounting
32. Journal
33. Ledger
34. Profit & Loss
35. Cash flow
36. Reports
37. Dashboard
38. Notifications
39. Audit logs
40. Settings
41. Backup
42. Offline readiness
43. Responsive UI

END-TO-END TESTS:

Test this complete flow:

Investment
→ Purchase
→ Receive Stock
→ Inventory
→ POS Sale
→ Payment
→ Receipt
→ Stock Decrease
→ COGS
→ Revenue
→ Profit
→ Expense
→ Net Profit
→ Dashboard

Test:

Purchase with cash
Purchase with due
Purchase with partial payment

Cash sale
MFS sale
Mixed payment
Credit sale

Sales return
Purchase return

Customer payment
Supplier payment

Expense
Investment

Stock adjustment
Damage
Lost
Stock count

Daily cash closing

Sale void/reversal

ACCOUNTING TEST:

For every financial transaction verify:

Total Debit = Total Credit

Verify inventory value.

Verify COGS.

Verify gross profit.

Verify net profit.

Verify receivable.

Verify payable.

Verify cash balance.

Verify bank/MFS balances.

CONCURRENCY TEST:

Simulate two users selling the same limited-stock product.

Make sure stock cannot incorrectly become negative or be deducted twice.

SECURITY TEST:

Try accessing protected API endpoints without permission.

Try accessing another user's restricted resources.

Try performing unauthorized:
- price changes
- discounts
- stock adjustments
- sale void
- accounting changes
- user management

Fix all vulnerabilities found.

DATABASE:

Review:

Indexes
Foreign keys
Constraints
Transactions
N+1 queries
Slow queries
Unused fields
Duplicate fields

Ensure migration works from a clean database.

SEED:

Create useful demo data:

Users
Products
Categories
Suppliers
Customers
Purchases
Sales
Expenses
Investments

No fake dashboard numbers; demo numbers must come from actual records.

BACKUP:

Implement/document:

Database backup
Database restore
Backup retention
Environment recovery

DEPLOYMENT:

Prepare production deployment.

Provide:

Dockerfile
docker-compose.yml if appropriate
Nginx config
Production environment template
Database migration command
Seed command
Build command
Start command
Backup command
Restore command

CI/CD:

Create GitHub Actions workflow for:

Install
Lint
Test
Build

If deployment credentials are available through environment secrets, prepare deployment workflow without hardcoding secrets.

DOCUMENTATION:

Create:

README.md
ARCHITECTURE.md
DATABASE.md
API.md
DEPLOYMENT.md
BACKUP.md
POS-HARDWARE.md
USER-ROLES.md

README must explain exactly how a developer can:

1. Clone project
2. Install dependencies
3. Configure environment
4. Create database
5. Run migrations
6. Seed database
7. Run development server
8. Run tests
9. Build production
10. Deploy

FINAL REQUIREMENT:

Do not just tell me what is wrong.

Inspect the code.
Fix issues.
Run tests.
Build the application.
Resolve errors.
Verify the complete system.

At the end provide a final report containing:

- Implemented modules
- Database status
- API status
- Frontend status
- POS status
- Accounting status
- Test results
- Build result
- Security result
- Remaining limitations, if any
- Exact commands to run the project

The final result must be a production-ready Barakah Finance Library & Stationery Business Management System, not a prototype or static demo.