const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getExpenses = async (req, res) => {
    try {
        console.log("Received request for expenses");
        console.log("User Auth:", req.auth); // Check Clerk auth

        // Basic filtering can be added here (e.g., by date, supplier, etc.)
        // For now, fetching all expenses ordered by date desc
        const expenses = await prisma.expense.findMany({
            orderBy: { date: 'desc' },
            include: {
                lineItems: true,
                // Include other relations if needed for display, but usually IDs are enough if we have master data
            }
        });
        console.log(`Found ${expenses.length} expenses`);
        // Add Cache-Control header for 5 seconds
        res.set('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=59');
        res.json(expenses);
    } catch (error) {
        console.error("Error fetching expenses:", error);
        res.status(500).json({ error: "Failed to fetch expenses" });
    }
};

exports.createExpense = async (req, res) => {
    try {
        const data = req.body;

        // Transform lineItems to match Prisma schema if necessary
        // The frontend sends lineItems, we need to ensure they match the schema
        const lineItemsData = data.lineItems?.map(item => ({
            amount: item.amount,
            description: item.description,
            sectorId: item.sectorId,
            marketingChannelId: item.marketingChannelId,
            branchId: item.branchId || item.assignmentId, // Handle frontend naming variation
            contractId: item.contractId || item.relatedContractId, // Handle frontend naming variation
            contractLineItemId: item.contractLineItemId || item.relatedLineItemId || item.relatedLineItemID // Contract line item link
        })) || [];

        const expense = await prisma.expense.create({
            data: {
                id: data.id, // Optional: use provided ID if available (e.g. for storage path consistency)
                supplierId: data.supplierId,
                date: new Date(data.date),
                totalAmount: data.totalAmount,
                description: data.description,
                costDomain: data.costDomain || 'marketing',
                isAmortized: data.isAmortized || false,
                amortizationStartDate: data.amortizationStartDate ? new Date(data.amortizationStartDate) : null,
                amortizationEndDate: data.amortizationEndDate ? new Date(data.amortizationEndDate) : null,
                invoicePdfUrl: data.invoicePdfUrl,
                contractPdfUrl: data.contractPdfUrl,
                relatedContractId: data.relatedContractId,
                requiresContract: data.requiresContract,
                lineItems: {
                    create: lineItemsData
                }
            },
            include: { lineItems: true }
        });

        res.json(expense);
    } catch (error) {
        console.error("Error creating expense:", error);
        res.status(500).json({ error: "Failed to create expense" });
    }
};

exports.updateExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Transaction to handle line items update (delete all and recreate is simplest for now, or update smartly)
        // For simplicity in this migration phase: delete existing line items and recreate them.

        const updatedExpense = await prisma.$transaction(async (tx) => {
            // 1. Update main expense fields
            const expense = await tx.expense.update({
                where: { id },
                data: {
                    supplierId: data.supplierId,
                    date: new Date(data.date),
                    totalAmount: data.totalAmount,
                    description: data.description,
                    costDomain: data.costDomain,
                    isAmortized: data.isAmortized,
                    amortizationStartDate: data.amortizationStartDate ? new Date(data.amortizationStartDate) : null,
                    amortizationEndDate: data.amortizationEndDate ? new Date(data.amortizationEndDate) : null,
                    invoicePdfUrl: data.invoicePdfUrl,
                    contractPdfUrl: data.contractPdfUrl,
                    relatedContractId: data.relatedContractId,
                    requiresContract: data.requiresContract,
                }
            });

            // 2. Handle line items
            if (data.lineItems) {
                // Delete existing
                await tx.expenseLineItem.deleteMany({ where: { expenseId: id } });

                // Create new
                const lineItemsData = data.lineItems.map(item => ({
                    expenseId: id,
                    amount: item.amount,
                    description: item.description,
                    sectorId: item.sectorId,
                    marketingChannelId: item.marketingChannelId,
                    branchId: item.branchId || item.assignmentId,
                    contractId: item.contractId || item.relatedContractId,
                    contractLineItemId: item.contractLineItemId || item.relatedLineItemId || item.relatedLineItemID // Contract line item link
                }));

                await tx.expenseLineItem.createMany({ data: lineItemsData });
            }

            return tx.expense.findUnique({
                where: { id },
                include: { lineItems: true }
            });
        });

        res.json(updatedExpense);

    } catch (error) {
        console.error("Error updating expense:", error);
        res.status(500).json({ error: "Failed to update expense" });
    }
};

exports.deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.expense.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting expense:", error);
        res.status(500).json({ error: "Failed to delete expense" });
    }
};
