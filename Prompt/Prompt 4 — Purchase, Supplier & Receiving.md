Continue the existing project.

Do not remove or break previous functionality.

Now implement the complete Purchase, Supplier and Stock Receiving system.

SUPPLIER MANAGEMENT:

Create:

- Supplier list
- Add supplier
- Edit supplier
- Supplier details
- Supplier purchase history
- Supplier payment history
- Supplier payable/due
- Supplier statement
- Supplier search

Supplier fields:

Name
Company
Mobile
Email
Address
Opening Due
Notes
Active/Inactive

PURCHASE:

Create a professional Purchase screen.

Workflow:

Supplier
→ Purchase Invoice
→ Barcode Scan/Search
→ Product
→ Quantity
→ Purchase Cost
→ Discount
→ Tax if enabled
→ Total
→ Payment
→ Receive

BARCODE RECEIVING:

When stock arrives:

Cashier/inventory staff can scan barcode.

If barcode exists:
Automatically identify product.

If barcode does not exist:
Show New Product workflow.

PURCHASE ITEM:

Each item should store historical:

Product
Quantity
Unit Cost
Discount
Tax
Total Cost

Never depend on the product's current cost for historical purchases.

PAYMENT:

Support:

- Cash
- Bank
- bKash
- Nagad
- Card
- Partial payment
- Due

PURCHASE STATUS:

Draft
Received
Partially Paid
Paid
Due
Cancelled

When purchase is received:

1. Increase inventory.
2. Create inventory movement.
3. Update supplier payable.
4. Create accounting journal.
5. Update cash/bank if paid.
6. Save audit log.

All related operations must use a database transaction.

PURCHASE RETURN:

Implement purchase return.

Workflow:

Original Purchase
→ Select Product
→ Return Quantity
→ Reason
→ Confirm
→ Stock decreases
→ Supplier payable/accounting reverses appropriately

SUPPLIER STATEMENT:

Show:

Opening balance
Purchases
Payments
Returns
Current payable

REPORTS:

- Supplier-wise purchase
- Date-wise purchase
- Product-wise purchase
- Purchase due
- Supplier payable
- Purchase return

UI:

Create a fast professional purchase receiving interface optimized for barcode scanner.

Keyboard-friendly behavior is required.

At the end:
- create migrations
- seed supplier/purchase demo data
- test receiving
- test partial payment
- test purchase return
- verify stock and accounting
- fix errors
- summarize.