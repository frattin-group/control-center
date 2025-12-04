const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findExpensesWithoutLineItemLinks() {
    console.log('Finding expenses without contractLineItemId...\n');

    // Get expenses with line items that have contracts but no contractLineItemId
    const expenses = await prisma.expense.findMany({
        where: {
            lineItems: {
                some: {
                    contractId: { not: null },
                    contractLineItemId: null
                }
            }
        },
        include: {
            lineItems: {
                where: {
                    contractId: { not: null },
                    contractLineItemId: null
                }
            }
        },
        orderBy: {
            date: 'desc'
        }
    });

    console.log(`Found ${expenses.length} expenses with unlinked contract line items\n`);
    console.log('='.repeat(80));

    expenses.slice(0, 15).forEach((expense, i) => {
        console.log(`\n${i + 1}. SPESA DEL ${expense.date}`);
        console.log(`   ID: ${expense.id}`);
        console.log(`   Descrizione: ${expense.description || 'N/D'}`);
        console.log(`   Voci senza contractLineItemId:`);

        expense.lineItems.forEach((item, j) => {
            console.log(`      ${j + 1}. Importo: €${item.amount}`);
            console.log(`         Descrizione: ${item.description || 'N/D'}`);
            console.log(`         ContractId: ${item.contractId}`);
            console.log(`         contractLineItemId: ${item.contractLineItemId || 'NULL ❌'}`);
        });
    });

    console.log('\n' + '='.repeat(80));
    console.log('\nPer verificare, apri una di queste spese nella modale e controlla');
    console.log('se nel dropdown "Seleziona LineItem specifico" c\'è una voce selezionata.');

    await prisma.$disconnect();
}

findExpensesWithoutLineItemLinks();
