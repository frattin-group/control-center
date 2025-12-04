const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkData() {
    try {
        console.log('Checking Sectors...');
        const sectors = await prisma.sector.findMany();
        console.log('Sectors in DB:', sectors.map(s => `${s.id}: ${s.name}`));

        const knownSectorIds = new Set(sectors.map(s => s.id));

        console.log('\nChecking all line items for invalid sectorId...');
        const allLineItems = await prisma.expenseLineItem.findMany({
            select: { id: true, sectorId: true, amount: true, expenseId: true }
        });

        let invalidCount = 0;
        let invalidAmount = 0;

        allLineItems.forEach(li => {
            if (!li.sectorId || !knownSectorIds.has(li.sectorId)) {
                invalidCount++;
                invalidAmount += li.amount;
                if (invalidCount <= 5) {
                    console.log(`- Invalid Sector: "${li.sectorId}" (Type: ${typeof li.sectorId}), Amount: ${li.amount}, ExpenseID: ${li.expenseId}`);
                }
            }
        });

        console.log(`Found ${invalidCount} items with invalid/unknown sectorId.`);
        console.log(`Total amount in 'Altro' (invalid sector): ${invalidAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`);

        console.log('\nChecking Expenses with NO line items...');
        const expensesNoLines = await prisma.expense.findMany({
            where: {
                lineItems: {
                    none: {}
                }
            }
        });

        console.log(`Found ${expensesNoLines.length} expenses with NO line items.`);
        const sumNoLines = expensesNoLines.reduce((sum, e) => sum + e.totalAmount, 0);
        console.log(`Total amount in expenses with no line items: ${sumNoLines.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`);

        if (expensesNoLines.length > 0) {
            console.log('Sample expenses with no line items:');
            expensesNoLines.slice(0, 5).forEach(e => {
                console.log(`- ID: ${e.id}, Amount: ${e.totalAmount}, SectorId: ${e.sectorId}, Desc: ${e.description}`);
            });
        }

        console.log('\nSearching for expense approx 30k...');
        // Search for expenses with totalAmount around 30102
        // Or line items
        const target = 30102.89;
        const tolerance = 1.0;

        const expenses = await prisma.expense.findMany({
            where: {
                totalAmount: {
                    gte: target - tolerance,
                    lte: target + tolerance
                }
            }
        });
        console.log(`Found ${expenses.length} expenses with amount ~${target}:`);
        expenses.forEach(e => console.log(JSON.stringify(e, null, 2)));

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
