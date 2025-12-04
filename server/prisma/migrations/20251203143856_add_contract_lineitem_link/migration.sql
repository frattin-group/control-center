-- AlterTable
ALTER TABLE "expense_line_items" ADD COLUMN     "contractLineItemId" TEXT;

-- AddForeignKey
ALTER TABLE "expense_line_items" ADD CONSTRAINT "expense_line_items_contractLineItemId_fkey" FOREIGN KEY ("contractLineItemId") REFERENCES "contract_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
