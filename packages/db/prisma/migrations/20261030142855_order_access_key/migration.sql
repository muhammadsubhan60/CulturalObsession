-- Secret for the customer's order-status link. Existing orders get a random key.
ALTER TABLE "Order" ADD COLUMN "accessKey" TEXT;
UPDATE "Order" SET "accessKey" = replace(gen_random_uuid()::text, '-', '') WHERE "accessKey" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "accessKey" SET NOT NULL;
CREATE UNIQUE INDEX "Order_accessKey_key" ON "Order"("accessKey");

-- Human-readable order numbers (CO-100001, CO-100002, …) that never repeat, even under concurrency.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 100001;
