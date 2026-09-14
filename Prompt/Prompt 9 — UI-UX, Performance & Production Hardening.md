Continue the existing project.

At this stage, the major business functionality already exists.

Now perform a complete UI/UX, performance, security and production-hardening pass.

IMPORTANT:
Do not remove working business logic.

FIRST:
Inspect every existing page and module.

Improve the entire application consistently.

DESIGN LANGUAGE:

Create a premium modern business management interface for:

**Barakah Finance**

Design characteristics:

- clean
- professional
- modern
- trustworthy
- minimal
- fast
- business-focused
- mobile responsive

Avoid unnecessary visual decoration.

LAYOUT:

Desktop:
- collapsible sidebar
- top navigation
- breadcrumb
- global search
- notifications
- profile menu

Mobile/tablet:
- responsive navigation
- mobile-friendly tables
- responsive forms
- bottom/action menus where useful

COMPONENTS:

Create reusable:

Buttons
Inputs
Select
Combobox
Date Picker
Tables
Cards
Charts
Modal
Drawer
Dropdown
Tabs
Toast
Alert
Confirmation Dialog
Skeleton
Empty State
Error State
Pagination

TABLES:

Every major table should support:

Search
Filter
Sort
Pagination
Column visibility where useful
Export
Row action menu

FORMS:

Use consistent:
- validation
- error message
- loading state
- success state
- unsaved change warning where necessary

POS:

Optimize POS separately.

Barcode input must always be easy to focus.

Make scan → product → cart extremely fast.

PERFORMANCE:

Implement:

- database indexes
- pagination
- query optimization
- selective data fetching
- lazy loading
- caching where useful
- debounced search
- image optimization
- server-side rendering where useful
- code splitting

Do not fetch huge datasets unnecessarily.

SECURITY:

Review:

Authentication
Authorization
Input validation
CSRF/session security where applicable
XSS protection
SQL injection
Rate limiting
File upload validation
API security
Sensitive data exposure
Secrets handling

AUDIT:

Verify sensitive actions generate audit records.

ERROR HANDLING:

Create friendly user-facing errors.

Do not expose stack traces/database details to normal users.

OFFLINE READINESS:

Prepare the web POS for offline capability.

If full offline implementation is practical in this architecture, implement it using a local browser database such as IndexedDB.

Requirements:

- cache essential product/catalog data
- allow authorized offline POS transactions
- generate client transaction ID
- queue unsynced transactions
- synchronize when internet returns
- prevent duplicate synchronization
- show sync status
- show failed sync items
- allow reconciliation

Do not compromise accounting integrity.

SETTINGS:

Create Settings module:

Business Information
Logo
Address
Phone
Receipt settings
Invoice numbering
Currency
Timezone
Language
Low-stock defaults
Payment methods
Tax configuration ready
User settings
Notification settings
Backup settings

BUSINESS PROFILE:

Barakah Finance
Library & Stationery

Currency:
BDT / ৳

Timezone:
Asia/Dhaka

LANGUAGE:

Prepare Bangla and English localization architecture.

ACCESSIBILITY:

Use:
- keyboard navigation
- readable contrast
- labels
- focus states
- semantic HTML

FINAL QA:

Visit every page.

Check:
- broken links
- broken buttons
- missing loading states
- console errors
- API errors
- responsive issues
- form validation
- permission issues

Run:
- build
- lint
- tests

Fix all errors.

Do not simply report errors.
Actually fix them.