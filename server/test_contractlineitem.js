const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testExpenseWithLineItem() {
    // Get one expense with contractLineItemId
    const expense = await prisma.expense.findFirst({
        where: {
            lineItems: {
                some: {
                    contractLineItemId: { not: null }
                }
            }
        },
        include: {
            lineItems: true
        }
    });

    console.log('Found expense:', expense?.id);
    console.log('LineItems:', expense?.lineItems);

    await prisma.$disconnect();
}

testExpenseWithLineItem();
