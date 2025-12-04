const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.updateBudget = async (req, res) => {
    try {
        const { supplierId, year, allocations } = req.body;

        if (!supplierId || !year) {
            return res.status(400).json({ error: "Supplier ID and Year are required" });
        }

        console.log(`Updating budget for supplier ${supplierId}, year ${year}`);

        // Transaction to ensure atomicity
        const result = await prisma.$transaction(async (prisma) => {
            // 1. Find or create the Budget record
            let budget = await prisma.budget.findUnique({
                where: {
                    supplierId_year: {
                        supplierId: supplierId,
                        year: parseInt(year)
                    }
                }
            });

            if (!budget) {
                budget = await prisma.budget.create({
                    data: {
                        supplierId: supplierId,
                        year: parseInt(year)
                    }
                });
            }

            // 2. Delete existing allocations for this budget
            await prisma.budgetAllocation.deleteMany({
                where: {
                    budgetId: budget.id
                }
            });

            // 3. Create new allocations
            if (allocations && allocations.length > 0) {
                await prisma.budgetAllocation.createMany({
                    data: allocations.map(alloc => ({
                        budgetId: budget.id,
                        sectorId: alloc.sectorId,
                        marketingChannelId: alloc.marketingChannelId,
                        branchId: alloc.branchId,
                        budgetAmount: parseFloat(alloc.budgetAmount) || 0
                    }))
                });
            }

            // 4. Return the updated budget with allocations
            return prisma.budget.findUnique({
                where: { id: budget.id },
                include: { allocations: true }
            });
        });

        res.json(result);
    } catch (error) {
        console.error("Error updating budget:", error);
        res.status(500).json({ error: "Failed to update budget" });
    }
};
