const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
    console.log('Checking sector_budgets...');
    try {
        const all = await prisma.sectorBudget.findMany();
        console.log(`Found ${all.length} sector budgets.`);
        all.forEach(sb => console.log(sb));

        const currentYear = new Date().getFullYear();
        console.log(`Current year: ${currentYear}`);

        const current = await prisma.sectorBudget.findMany({ where: { year: currentYear } });
        console.log(`Found ${current.length} for current year.`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspect();
