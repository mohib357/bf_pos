Continue the existing project and preserve all previous functionality.

Now build a production-ready Retail POS system for Barakah Finance Library & Stationery.

The POS must be extremely fast and optimized for barcode scanner usage.

POS SCREEN:

Create a dedicated POS interface.

Layout should include:

Left/main:
- Barcode input
- Search
- Product results
- Categories
- Quick product selection

Right:
- Cart
- Product
- Quantity
- Unit price
- Discount
- Line total
- Remove
- Customer

Bottom:
Subtotal
Discount
Grand Total
Paid
Due
Change

Payment buttons:

CASH
CARD
BANK
BKASH
NAGAD
MIXED
DUE

BARCODE FLOW:

Scanner sends barcode.

System:
1. Read barcode.
2. Find product.
3. Add to cart.
4. If already in cart, increase quantity.
5. Return focus to barcode input.

This must feel instant.

KEYBOARD SHORTCUTS:

Provide useful shortcuts such as:

F2 Search
F4 Customer
F6 Discount
F8 Payment
F9 Complete Sale
Esc Cancel/Close modal

Do not conflict unnecessarily with browser shortcuts.

SALE TRANSACTION:

When completing a sale:

1. Validate stock.
2. Create sale.
3. Create sale items.
4. Create payment(s).
5. Create inventory movements.
6. Calculate COGS.
7. Create accounting journal.
8. Update customer due if applicable.
9. Update cash register if cash.
10. Create audit log.

These operations must happen inside a database transaction.

PAYMENT:

Support multiple payment methods.

Also support mixed payment:

Example:
Cash 500
bKash 300
Due 200

Total 1000.

RECEIPT:

Create 80mm thermal receipt design.

Receipt:

Business name
Logo
Address
Phone
Invoice number
Date/time
Cashier
Products
Quantity
Price
Discount
Subtotal
Total
Paid
Due
Change
Payment method

Add configurable footer.

PRINT:

Implement browser/ESC-POS-ready printing architecture.

Provide:
- Print
- Reprint
- Download PDF
- Preview

SALE RETURN:

Implement complete sales return.

Original invoice lookup
→ select product
→ return quantity
→ refund/payment adjustment
→ inventory increase
→ accounting reversal

VOID:

Authorized users can void a sale.

Never physically delete financial history.

Create reversal/void transaction and audit log.

CUSTOMER:

POS can select existing customer or create quick customer.

CUSTOMER DUE:

If sale is on credit:
Accounts Receivable increases.

PAYMENT:

Later customer payment reduces due and creates ledger entry.

CASH REGISTER:

POS must work with:
Opening cash
Cash sale
Cash refund
Cash expense
Cash adjustment
Closing cash

At the end:
Expected cash
Actual cash
Difference

UI:

The POS must be:
- fast
- clean
- distraction-free
- keyboard-friendly
- barcode-first
- responsive

At the end:
- test 1,000+ product catalog search
- test barcode scan
- test repeated barcode
- test mixed payment
- test due
- test return
- test void
- test receipt
- test concurrent sale
- fix all errors.