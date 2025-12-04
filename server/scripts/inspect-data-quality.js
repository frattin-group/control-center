const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectData() {
    try {
        // Count Expenses
        const expenseCount = await prisma.expense.count();
        console.log(`Total Expenses: ${expenseCount}`);

        const expensesByDomain = await prisma.expense.groupBy({
            by: ['costDomain'],
            _count: { id: true },
            _sum: { totalAmount: true }
        });
        console.log('Expenses by Domain:', JSON.stringify(expensesByDomain, null, 2));

        // Count Expenses by Year
        const expensesByYear = await prisma.expense.groupBy({
            by: ['date'],
            _sum: { totalAmount: true }
        });

        // Aggregate by year manually since Prisma groupBy date is exact timestamp
        const byYear = {};
        expensesByYear.forEach(e => {
            const year = new Date(e.date).getFullYear();
            if (!byYear[year]) byYear[year] = { count: 0, total: 0 };
            byYear[year].count++;
            byYear[year].total += e._sum.totalAmount || 0;
        });

        console.log('Expenses by Year:', JSON.stringify(byYear, null, 2));

        // Check for expenses with 0 line items
        const expensesWithNoLines = await prisma.expense.count({
            where: {
                lineItems: {
                    none: {}
                }
            }
        });
        console.log(`Expenses with 0 line items: ${expensesWithNoLines}`);

        // Check for expenses with line items but totalAmount 0?
        // No, totalAmount is on Expense.

        // Check if line items have sectorId/marketingChannelId
        const lineItemsWithoutSector = await prisma.expenseLineItem.count({
            where: {
                sectorId: null
            }
        });
        console.log(`Line items without sectorId: ${lineItemsWithoutSector}`);

        // Count Contracts
        const contractCount = await prisma.contract.count();
        console.log(`Total Contracts: ${contractCount}`);

        // Count ContractLineItems
        const lineItemCount = await prisma.contractLineItem.count();
        console.log(`Total ContractLineItems: ${lineItemCount}`);

        // Check for potential duplicates in ContractLineItems
        // We can group by contractId, description, totalAmount, startDate
        const duplicates = await prisma.contractLineItem.groupBy({
            by: ['contractId', 'description', 'totalAmount', 'startDate'],
            _count: { id: true },
            having: {
                id: {
                    _count: {
                        gt: 1
                    }
                }
            }
        });

        console.log(`Found ${duplicates.length} sets of duplicate ContractLineItems.`);
        if (duplicates.length > 0) {
            console.log('Example duplicate:', duplicates[0]);
        }

    } catch (error) {
        console.error('Inspection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectData();
