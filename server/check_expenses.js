const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const expensesCount = await prisma.expense.count();
    console.log(`Total expenses: ${expensesCount}`);

    const expensesWithContract = await prisma.expense.findMany({
        where: {
            OR: [
                { relatedContractId: { not: null } },
                { lineItems: { some: { contractId: { not: null } } } }
            ]
        },
        take: 5,
        include: { lineItems: true }
    });

    console.log(`Expenses linked to contracts (sample of 5):`);
    console.log(JSON.stringify(expensesWithContract, null, 2));

    if (expensesWithContract.length > 0) {
        const contractId = expensesWithContract[0].relatedContractId || expensesWithContract[0].lineItems[0]?.relatedContractId;
        if (contractId) {
            const contract = await prisma.contract.findUnique({ where: { id: contractId } });
            console.log(`Checking if contract ${contractId} exists:`, contract ? 'YES' : 'NO');
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
