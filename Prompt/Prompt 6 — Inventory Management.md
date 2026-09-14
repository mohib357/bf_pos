Continue from the existing project.

Now implement the complete Inventory Management system.

IMPORTANT:
Use the existing stock movement architecture.
Do NOT replace it with a simplistic current_stock-only system.

INVENTORY DASHBOARD:

Show:

Total Products
Total Units
Inventory Purchase Value
Estimated Sales Value
Potential Gross Margin
Low Stock
Out of Stock
Damaged Stock
Recent Movements

STOCK MOVEMENT:

Support:

Opening Stock
Purchase
Sale
Sales Return
Purchase Return
Damage
Lost
Adjustment In
Adjustment Out
Transfer In
Transfer Out

Every movement must store:

Product
Quantity
Unit Cost
Movement Type
Reference Type
Reference ID
Branch
Warehouse
User
Reason
Timestamp

STOCK VALUATION:

Implement the selected costing method consistently.

Use Weighted Average Cost initially unless the existing accounting specification requires FIFO.

Historical costs must remain unchanged.

LOW STOCK:

Each product has:

Minimum Stock
Reorder Level

If:
Current Stock <= Reorder Level

Show Low Stock.

If:
Current Stock = 0

Show Out of Stock.

DASHBOARD:

Show counts and searchable lists.

STOCK COUNT:

Create physical stock counting workflow.

Process:

Create Count Session
→ Select Warehouse
→ Scan/Search Products
→ Enter Physical Quantity
→ Compare System Quantity
→ Show Difference
→ Submit
→ Manager Approval
→ Adjustment

Example:

System = 100
Physical = 97
Difference = -3

Do not automatically modify stock until authorized approval if approval is required.

STOCK ADJUSTMENT:

Authorized users can:

Increase
Decrease

Reason mandatory.

Examples:

Damage
Lost
Correction
Opening Stock
Other

All adjustments must create stock movement and audit log.

STOCK HISTORY:

Product detail must show complete stock history.

WAREHOUSE:

Support warehouse structure even if there is only one warehouse initially.

Prepare:

Branch
Warehouse
Stock

for future multi-branch.

STOCK TRANSFER:

Prepare/implement:

Warehouse A
→ Transfer
→ Warehouse B

Create Transfer Out and Transfer In movements safely.

REPORTS:

- Current stock
- Stock valuation
- Low stock
- Out of stock
- Stock movement
- Stock adjustment
- Damage
- Lost
- Stock count variance
- Slow moving products
- Dead stock

PERFORMANCE:

Do not load all inventory records at once.

Use:
- server pagination
- indexes
- filtering
- search
- aggregation queries
- caching where useful

At the end:
- test stock consistency
- test concurrent sale
- test purchase + sale sequence
- test stock count
- test adjustment
- test transfer
- fix all issues.