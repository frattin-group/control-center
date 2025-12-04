const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

const prisma = new PrismaClient();

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateContractLineItemLinks() {
    console.log('Starting migration of contract line item links...\n');

    try {
        // Fetch all expenses from Firestore
        const expensesSnapshot = await db.collection('expenses').get();
        console.log(`Found ${expensesSnapshot.size} expenses in Firestore\n`);

        let totalUpdated = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        let totalNoLink = 0;

        for (const expenseDoc of expensesSnapshot.docs) {
            const firestoreExpense = expenseDoc.data();
            const firestoreExpenseId = expenseDoc.id;

            if (!firestoreExpense.lineItems || !Array.isArray(firestoreExpense.lineItems)) {
                continue;
            }

            for (const firestoreLineItem of firestoreExpense.lineItems) {
                const relatedLineItemId = firestoreLineItem.relatedLineItemId || firestoreLineItem.relatedLineItemID;
                const relatedContractId = firestoreLineItem.relatedContractId;

                if (!relatedLineItemId || !relatedContractId) {
                    totalNoLink++;
                    continue;
                }

                try {
                    // Find the corresponding expense line item in PostgreSQL by expense ID and amount
                    const postgresExpense = await prisma.expense.findUnique({
                        where: { id: firestoreExpenseId },
                        include: { lineItems: true }
                    });

                    if (!postgresExpense) {
                        totalSkipped++;
                        continue;
                    }

                    // Find matching expense line item by amount
                    const matchingExpenseLineItem = postgresExpense.lineItems.find(li => {
                        return Math.abs(li.amount - firestoreLineItem.amount) < 0.01;
                    });

                    if (!matchingExpenseLineItem) {
                        totalSkipped++;
                        continue;
                    }

                    // Now find matching contract line item in PostgreSQL by contractId + amount + description
                    const contractLineItems = await prisma.contractLineItem.findMany({
                        where: { contractId: relatedContractId }
                    });

                    if (contractLineItems.length === 0) {
                        totalSkipped++;
                        continue;
                    }

                    // Try to match by description first
                    let matchingContractLineItem = contractLineItems.find(cli => {
                        const descMatch = cli.description && firestoreLineItem.description &&
                            cli.description.trim() === firestoreLineItem.description.trim();
                        return descMatch;
                    });

                    // If no description match, try by amount (for contracts with single line item)
                    if (!matchingContractLineItem && contractLineItems.length === 1) {
                        matchingContractLineItem = contractLineItems[0];
                    }

                    if (!matchingContractLineItem) {
                        console.log(`  ⚠️  Could not match contract line item for expense ${firestoreExpenseId}, contract ${relatedContractId}`);
                        totalSkipped++;
                        continue;
                    }

                    // Update the expense line item with the contractLineItemId
                    await prisma.expenseLineItem.update({
                        where: { id: matchingExpenseLineItem.id },
                        data: { contractLineItemId: matchingContractLineItem.id }
                    });

                    console.log(`  ✓ Linked expense line item ${matchingExpenseLineItem.id} -> contract line item ${matchingContractLineItem.id}`);
                    totalUpdated++;

                } catch (error) {
                    console.error(`  ✗ Error processing line item: ${error.message}`);
                    totalErrors++;
                }
            }
        }

        console.log(`\n=== Migration Summary ===`);
        console.log(`Total updated: ${totalUpdated}`);
        console.log(`Total with no link: ${totalNoLink}`);
        console.log(`Total skipped: ${totalSkipped}`);
        console.log(`Total errors: ${totalErrors}`);

    } catch (error) {
        console.error('Fatal error during migration:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
        await admin.app().delete();
    }
}

// Run the migration
migrateContractLineItemLinks()
    .then(() => {
        console.log('\n✓ Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n✗ Migration failed:', error);
        process.exit(1);
    });
