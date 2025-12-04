const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getSectorBudgets = async (req, res) => {
    try {
        const { year } = req.query;
        const where = year ? { year: parseInt(year) } : {};
        const budgets = await prisma.sectorBudget.findMany({ where });
        res.json(budgets);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching sector budgets' });
    }
};

exports.upsertSectorBudget = async (req, res) => {
    try {
        const { sectorId, year, maxAmount } = req.body;

        // Use a composite ID for the doc if needed, but Prisma uses sectorId_year unique constraint
        const budget = await prisma.sectorBudget.upsert({
            where: {
                sectorId_year: {
                    sectorId,
                    year: parseInt(year)
                }
            },
            update: {
                amount: parseFloat(maxAmount)
            },
            create: {
                sectorId,
                year: parseInt(year),
                amount: parseFloat(maxAmount)
            }
        });

        // Return with maxAmount alias to match frontend expectation if needed, 
        // but better to align frontend to 'amount'. 
        // For now, let's return both or just the object.
        res.json({ ...budget, maxAmount: budget.amount });
    } catch (error) {
        console.error("Error upserting sector budget:", error);
        res.status(500).json({ error: 'Error saving sector budget' });
    }
};

exports.deleteSectorBudget = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.sectorBudget.delete({ where: { id } });
        res.json({ message: 'Sector budget deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting sector budget' });
    }
};
