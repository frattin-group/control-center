const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateSectorBudgets() {
    try {
        console.log('Starting sector budgets migration...');

        const snapshot = await db.collection('sector_budgets').get();
        console.log(`Found ${snapshot.size} sector budgets in Firestore.`);

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Map maxAmount to amount
            const amount = data.maxAmount || data.amount || 0;

            console.log(`Migrating ${doc.id}: Sector ${data.sectorId}, Year ${data.year}, Amount ${amount}`);

            await prisma.sectorBudget.upsert({
                where: {
                    sectorId_year: {
                        sectorId: data.sectorId,
                        year: data.year
                    }
                },
                update: {
                    amount: parseFloat(amount)
                },
                create: {
                    sectorId: data.sectorId,
                    year: data.year,
                    amount: parseFloat(amount)
                }
            });
        }

        console.log('Sector budgets migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateSectorBudgets();
