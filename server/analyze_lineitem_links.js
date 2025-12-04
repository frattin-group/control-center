const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeContractLineItemLinks() {
    console.log('Analyzing contractLineItemId population in PostgreSQL...\n');

    // Get all expense line items
    const allLineItems = await prisma.expenseLineItem.findMany({
        where: {
            contractId: { not: null }
        }
    });

    const withContractLineItemId = allLineItems.filter(li => li.contractLineItemId !== null);
    const withoutContractLineItemId = allLineItems.filter(li => li.contractLineItemId === null);

    console.log(`Total expense line items linked to contracts: ${allLineItems.length}`);
    console.log(`With contractLineItemId: ${withContractLineItemId.length} (${((withContractLineItemId.length / allLineItems.length) * 100).toFixed(1)}%)`);
    console.log(`Without contractLineItemId: ${withoutContractLineItemId.length} (${((withoutContractLineItemId.length / allLineItems.length) * 100).toFixed(1)}%)`);
    console.log();

    // Calculate total amounts
    const totalAmountWith = withContractLineItemId.reduce((sum, li) => sum + parseFloat(li.amount), 0);
    const totalAmountWithout = withoutContractLineItemId.reduce((sum, li) => sum + parseFloat(li.amount), 0);
    const totalAmount = allLineItems.reduce((sum, li) => sum + parseFloat(li.amount), 0);

    console.log(`Total amount with contractLineItemId: €${totalAmountWith.toFixed(2)} (${((totalAmountWith / totalAmount) * 100).toFixed(1)}%)`);
    console.log(`Total amount without contractLineItemId: €${totalAmountWithout.toFixed(2)} (${((totalAmountWithout / totalAmount) * 100).toFixed(1)}%)`);
    console.log();

    // Show some examples without contractLineItemId
    console.log('Sample expense line items WITHOUT contractLineItemId:');
    withoutContractLineItemId.slice(0, 10).forEach((li, i) => {
        console.log(`${i + 1}. Expense: ${li.expenseId}, Amount: €${li.amount}, ContractId: ${li.contractId}`);
    });

    await prisma.$disconnect();
}

analyzeContractLineItemLinks();
