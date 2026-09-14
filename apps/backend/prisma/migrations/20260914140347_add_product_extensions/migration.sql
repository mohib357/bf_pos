-- AlterTable
ALTER TABLE "products" ADD COLUMN     "minimum_stock" DECIMAL(15,4) NOT NULL DEFAULT 0,
ADD COLUMN     "updated_by" TEXT,
ADD COLUMN     "wholesale_price" DECIMAL(15,4);

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "cost_price" DECIMAL(15,4) NOT NULL,
    "selling_price" DECIMAL(15,4) NOT NULL,
    "wholesale_price" DECIMAL(15,4),
    "mrp" DECIMAL(15,4),
    "changed_by" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_imports" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "preview" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "product_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_price_history_product_id_idx" ON "product_price_history"("product_id");

-- CreateIndex
CREATE INDEX "product_price_history_created_at_idx" ON "product_price_history"("created_at");

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
