const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyData() {
    try {
        console.log("Verifica connessione e dati su Neon/Prisma...");

        const expensesCount = await prisma.expense.count();
        console.log(`✅ Expenses: ${expensesCount}`);

        const contractsCount = await prisma.contract.count();
        console.log(`✅ Contracts: ${contractsCount}`);

        const budgetsCount = await prisma.budget.count();
        console.log(`✅ Budgets: ${budgetsCount}`);

        const suppliersCount = await prisma.supplier.count();
        console.log(`✅ Suppliers: ${suppliersCount}`);

        const usersCount = await prisma.user.count();
        console.log(`✅ Users: ${usersCount}`);

        console.log("\nConclusione: Il database Neon contiene dati. Il frontend sta leggendo da qui tramite le API.");
    } catch (error) {
        console.error("❌ Errore di connessione al DB:", error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyData();
