const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeExpensesByYear() {
    console.log('Analyzing expenses by year...\n');

    const allExpenses = await prisma.expense.findMany({
        include: {
            lineItems: true
        }
    });

    const expensesByYear = {};
    const contractExpensesByYear = {};
    const withoutLineItemByYear = {};

    allExpenses.forEach(expense => {
        const year = expense.date ? new Date(expense.date).getFullYear() : 'Unknown';

        if (!expensesByYear[year]) {
            expensesByYear[year] = { count: 0, total: 0 };
            contractExpensesByYear[year] = { count: 0, total: 0 };
            withoutLineItemByYear[year] = { count: 0, total: 0 };
        }

        expense.lineItems.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            expensesByYear[year].count++;
            expensesByYear[year].total += amount;

            if (item.contractId) {
                contractExpensesByYear[year].count++;
                contractExpensesByYear[year].total += amount;

                if (!item.contractLineItemId) {
                    withoutLineItemByYear[year].count++;
                    withoutLineItemByYear[year].total += amount;
                }
            }
        });
    });

    console.log('='.repeat(80));
    console.log('SPESE PER ANNO');
    console.log('='.repeat(80));

    Object.keys(expensesByYear).sort().forEach(year => {
        const all = expensesByYear[year];
        const contract = contractExpensesByYear[year];
        const missing = withoutLineItemByYear[year];

        console.log(`\n${year}:`);
        console.log(`  Totale spese: ${all.count} voci, €${all.total.toFixed(2)}`);
        console.log(`  Legate a contratti: ${contract.count} voci, €${contract.total.toFixed(2)}`);
        console.log(`  Senza contractLineItemId: ${missing.count} voci, €${missing.total.toFixed(2)}`);

        if (contract.count > 0) {
            const percentMissing = (missing.total / contract.total) * 100;
            console.log(`  % mancante: ${percentMissing.toFixed(1)}%`);
        }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\nSe i calcoli includono il 2026 ma l\'utente ha abbinato solo il 2025,');
    console.log('questo spiega la differenza nello scaduto!');

    await prisma.$disconnect();
}

analyzeExpensesByYear();
