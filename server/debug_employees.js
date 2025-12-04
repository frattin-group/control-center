const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEmployees() {
    try {
        const count = await prisma.employee.count();
        console.log(`Total employees in DB: ${count}`);

        if (count > 0) {
            const employees = await prisma.employee.findMany({ take: 5 });
            console.log('First 5 employees:', JSON.stringify(employees, null, 2));
        }
    } catch (error) {
        console.error('Error fetching employees:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkEmployees();
