const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    console.log('Checking DB connection...');
    try {
        const count = await prisma.expense.count();
        console.log(`Expenses count: ${count}`);

        if (count > 0) {
            const first = await prisma.expense.findFirst();
            console.log('First expense:', first);
        } else {
            console.log('Database seems empty.');
        }
    } catch (e) {
        console.error('Connection failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
