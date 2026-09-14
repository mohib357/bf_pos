Continue from the existing Barakah Finance project.

Do not rewrite working authentication/admin functionality.

Now implement a complete Product, Category, Brand, Unit, SKU and Barcode Management System.

PRODUCT MANAGEMENT:

Create a professional Product Management module.

Each product should support:

- Product ID
- Product Name Bangla
- Product Name English
- SKU
- Barcode
- Category
- Subcategory
- Brand
- Unit
- Purchase Cost
- Selling Price
- Wholesale Price
- Minimum Stock
- Reorder Level
- Product Image
- Description
- Active/Inactive
- Created By
- Updated By
- Created Date
- Updated Date

PRODUCT CATEGORIES:

Create categories suitable for:

Books
Madrasa Books
School Books
Islamic Books
Quran
Hadith
Arabic Books
Stationery
Pen
Pencil
Notebook
Paper
File
Folder
Educational Accessories
Office Supplies
Other

Admin must be able to create custom categories.

BRAND MANAGEMENT:

Create brand CRUD.

UNIT MANAGEMENT:

Support:

- Piece
- Box
- Pack
- Dozen
- Kg
- Gram
- Liter
- Meter
- Other custom units

BARCODE:

Implement:

1. Manufacturer barcode support.
2. Internal barcode generation.
3. SKU generation.
4. Barcode lookup.
5. Barcode uniqueness validation.
6. Barcode label printing.

BARCODE SEARCH:

A product must be searchable by:

- Barcode
- SKU
- Product name
- Category
- Brand

BARCODE LABEL:

Create a printable barcode label page.

Label should optionally contain:

Business name
Product name
Price
SKU
Barcode

The system should support bulk label generation.

PRODUCT IMPORT:

Implement CSV/Excel import.

Admin can upload product data.

System must:
- validate rows
- show errors
- preview data
- allow import
- prevent duplicate SKU/barcode
- show import summary

PRODUCT EXPORT:

Export products to Excel/CSV.

PRODUCT DETAIL PAGE:

Show:

- Product information
- Current stock
- Stock value
- Selling value
- Purchase history
- Sales history
- Stock movements
- Supplier history
- Price history
- Audit history

IMPORTANT:

Never change historical purchase/sale prices when the current product price changes.

Keep historical transaction values immutable.

UI:

Make the product page modern and fast.

Use:
- searchable table
- pagination
- filters
- category filter
- stock status filter
- bulk actions
- quick edit
- product drawer/modal
- responsive layout

At the end:
- migrate database
- seed realistic demo products
- test barcode lookup
- test import/export
- fix all errors
- verify permissions
- provide implementation summary.