import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('server/.env') });

const prisma = new PrismaClient();

async function debugDB() {
    try {
        const year = 2025;
        console.log(`Checking DB for year ${year}...`);

        const sectorBudgets = await prisma.sectorBudget.findMany({ where: { year } });
        console.log(`Sector Budgets found: ${sectorBudgets.length}`);
        console.log(JSON.stringify(sectorBudgets, null, 2));

        const budgets = await prisma.budget.findMany({ where: { year } });
        console.log(`Budgets found: ${budgets.length}`);

        // Check expenses count
        const expensesCount = await prisma.expense.count();
        console.log(`Total Expenses in DB: ${expensesCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debugDB();
