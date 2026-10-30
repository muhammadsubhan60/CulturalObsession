-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "optionNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
