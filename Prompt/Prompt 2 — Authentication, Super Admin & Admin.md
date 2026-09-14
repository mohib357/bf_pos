Continue working on the existing Barakah Finance Library & Stationery project.

Do NOT rebuild the project from scratch.
Do NOT remove working features from Prompt 1.
Inspect the current code and database first.

Now implement a complete production-ready Authentication, User Management, Super Admin and Admin system.

AUTHENTICATION:

Implement:

- Login
- Logout
- Session management
- Secure password hashing
- Forgot password
- Reset password
- Change password
- Remember session where appropriate
- Login validation
- Account lock/rate-limit protection
- Secure error messages

ADMIN PANEL:

Create a professional responsive Admin Dashboard.

Layout:

- Sidebar
- Top navigation
- Breadcrumb
- Search
- Notifications
- User profile
- Theme support
- Responsive mobile/tablet layout

SUPER ADMIN MODULE:

Super Admin must be able to:

- Create users
- Edit users
- Disable/enable users
- Assign roles
- Assign permissions
- Reset passwords
- View login/activity history
- Manage branches
- Manage warehouses
- Manage system settings
- View audit logs
- Configure numbering
- Configure business information

ROLES:

Implement:

1. Super Admin
2. Owner
3. Manager
4. Cashier
5. Inventory Staff
6. Accountant
7. Viewer

PERMISSION SYSTEM:

Permissions must be granular.

Examples:

products.view
products.create
products.update
products.delete

sales.view
sales.create
sales.update
sales.void
sales.return

purchases.view
purchases.create
purchases.update
purchases.approve

inventory.view
inventory.adjust
inventory.count
inventory.transfer

accounting.view
accounting.create
accounting.approve

reports.view
reports.export

users.view
users.create
users.update
users.disable

settings.view
settings.update

Never rely only on frontend hiding.
Every sensitive API endpoint must verify authorization on the server.

AUDIT LOG:

Log important actions:

- Login
- Logout
- Create
- Update
- Delete/Deactivate
- Sale void
- Discount override
- Price change
- Stock adjustment
- Purchase modification
- Payment
- Accounting entry
- User permission change
- Settings change

Audit entry should include:

user
action
module
record/reference
old value where appropriate
new value where appropriate
timestamp
IP/device metadata where practical

ADMIN DASHBOARD:

Show:

- Today's sales
- Today's gross profit
- Today's expenses
- Current inventory value
- Customer due
- Supplier payable
- Low stock
- Out of stock
- Cash position
- Recent activities

UI REQUIREMENTS:

Make it modern, clean and professional.

Use:
- consistent spacing
- cards
- tables
- modal/drawer forms
- toast notifications
- confirmation dialogs
- loading states
- empty states
- skeleton loaders
- responsive layout

Use Bangla-friendly UI labels where appropriate, but keep the codebase English.

At the end:

1. Run database migrations.
2. Run tests.
3. Start the project.
4. Fix all errors.
5. Verify all roles and permissions.
6. Verify unauthorized users cannot access protected APIs.
7. Give me a summary of implemented features.