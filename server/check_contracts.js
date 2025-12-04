const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.contract.count();
    console.log(`Total contracts in DB: ${count}`);

    if (count > 0) {
        const first = await prisma.contract.findFirst({ include: { plannedLineItems: true } });
        console.log('First contract sample:', JSON.stringify(first, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
