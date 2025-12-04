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

// Helper function to calculate overdue for a contract (matching ContractsPage.jsx logic)
function calculateOverduePostgres(contract, expenses, today) {
    const lineItemSpent = new Map();
    const lineItemSpentToDate = new Map();

    // Build line item lookup
    const lineItemIdLookup = new Map();
    contract.plannedLineItems?.forEach(li => {
        lineItemIdLookup.set(li.id, li.id);
    });

    // Allocate expenses to line items
    expenses.forEach(expense => {
        const expenseDate = new Date(expense.date);
        expenseDate.setHours(0, 0, 0, 0);
        const isUpToToday = expenseDate <= today;

        expense.lineItems?.forEach(item => {
            if ((item.contractId || item.relatedContractId) === contract.id) {
                const amount = parseFloat(item.amount) || 0;
                const normalizedId = lineItemIdLookup.get(item.contractLineItemId || item.relatedLineItemId);

                if (normalizedId) {
                    lineItemSpent.set(normalizedId, (lineItemSpent.get(normalizedId) || 0) + amount);
                    if (isUpToToday) {
                        lineItemSpentToDate.set(normalizedId, (lineItemSpentToDate.get(normalizedId) || 0) + amount);
                    }
                }
            }
        });
    });

    // Calculate overdue for each line item
    let totalOverdue = 0;

    contract.plannedLineItems?.forEach(li => {
        const total = parseFloat(li.totalAmount) || 0;
        const spent = lineItemSpent.get(li.id) || 0;
        const spentUpToToday = lineItemSpentToDate.get(li.id) || 0;
        const remaining = total - spent;

        if (remaining > 0) {
            const startDate = new Date(li.startDate);
            const endDate = new Date(li.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const contractEndOrToday = endDate < today ? endDate : today;
            const elapsedDays = Math.max(0, Math.ceil((contractEndOrToday - startDate) / (1000 * 60 * 60 * 24)) + 1);

            if (elapsedDays > 0) {
                const expectedToDate = (total / totalDays) * elapsedDays;
                const shortfall = expectedToDate - Math.min(spentUpToToday, expectedToDate);
                const overdue = Math.max(0, Math.min(remaining, shortfall));
                totalOverdue += overdue;
            }
        }
    });

    return totalOverdue;
}

// Simplified Firestore overdue calculation (you may need to adjust based on old app logic)
function calculateOverdueFirestore(contract, expenses, today) {
    // This is a simplified version - adjust based on actual old app logic
    const lineItemSpent = new Map();
    const lineItemSpentToDate = new Map();

    contract.plannedLineItems?.forEach(li => {
        lineItemSpent.set(li.id, 0);
        lineItemSpentToDate.set(li.id, 0);
    });

    expenses.forEach(expense => {
        const expenseDate = expense.date?.toDate ? expense.date.toDate() : new Date(expense.date);
        expenseDate.setHours(0, 0, 0, 0);
        const isUpToToday = expenseDate <= today;

        expense.lineItems?.forEach(item => {
            if ((item.relatedContractId || item.contractId) === contract.id) {
                const amount = parseFloat(item.amount) || 0;
                const lineItemId = item.relatedLineItemId || item.relatedLineItemID;

                if (lineItemId && lineItemSpent.has(lineItemId)) {
                    lineItemSpent.set(lineItemId, lineItemSpent.get(lineItemId) + amount);
                    if (isUpToToday) {
                        lineItemSpentToDate.set(lineItemId, lineItemSpentToDate.get(lineItemId) + amount);
                    }
                }
            }
        });
    });

    let totalOverdue = 0;

    contract.plannedLineItems?.forEach(li => {
        const total = parseFloat(li.totalAmount) || 0;
        const spent = lineItemSpent.get(li.id) || 0;
        const spentUpToToday = lineItemSpentToDate.get(li.id) || 0;
        const remaining = total - spent;

        if (remaining > 0) {
            const startDate = li.startDate?.toDate ? li.startDate.toDate() : new Date(li.startDate);
            const endDate = li.endDate?.toDate ? li.endDate.toDate() : new Date(li.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const contractEndOrToday = endDate < today ? endDate : today;
            const elapsedDays = Math.max(0, Math.ceil((contractEndOrToday - startDate) / (1000 * 60 * 60 * 24)) + 1);

            if (elapsedDays > 0) {
                const expectedToDate = (total / totalDays) * elapsedDays;
                const shortfall = expectedToDate - Math.min(spentUpToToday, expectedToDate);
                const overdue = Math.max(0, Math.min(remaining, shortfall));
                totalOverdue += overdue;
            }
        }
    });

    return totalOverdue;
}

async function compareOverdue() {
    console.log('='.repeat(80));
    console.log('CONFRONTO SCADUTO: Firestore vs PostgreSQL');
    console.log('='.repeat(80));
    console.log();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`Data di riferimento: ${today.toISOString().split('T')[0]}\n`);

    try {
        // Fetch PostgreSQL data
        const pgContracts = await prisma.contract.findMany({
            include: {
                plannedLineItems: true
            }
        });

        const pgExpenses = await prisma.expense.findMany({
            include: {
                lineItems: true
            }
        });

        // Fetch Firestore data
        const fsContractsSnapshot = await db.collection('contracts').get();
        const fsExpensesSnapshot = await db.collection('expenses').get();

        const fsContracts = [];
        fsContractsSnapshot.docs.forEach(doc => {
            fsContracts.push({ id: doc.id, ...doc.data() });
        });

        const fsExpenses = [];
        fsExpensesSnapshot.docs.forEach(doc => {
            fsExpenses.push({ id: doc.id, ...doc.data() });
        });

        console.log(`PostgreSQL: ${pgContracts.length} contratti, ${pgExpenses.length} spese`);
        console.log(`Firestore: ${fsContracts.length} contratti, ${fsExpenses.length} spese\n`);

        // Calculate overdue for each system
        let pgTotalOverdue = 0;
        let fsTotalOverdue = 0;

        const differences = [];

        // Compare each contract
        for (const pgContract of pgContracts) {
            const fsContract = fsContracts.find(c => c.id === pgContract.id);

            if (!fsContract) {
                console.log(`⚠️  Contratto ${pgContract.id} non trovato in Firestore`);
                continue;
            }

            const pgOverdue = calculateOverduePostgres(pgContract, pgExpenses, today);
            const fsOverdue = calculateOverdueFirestore(fsContract, fsExpenses, today);

            pgTotalOverdue += pgOverdue;
            fsTotalOverdue += fsOverdue;

            const diff = Math.abs(pgOverdue - fsOverdue);

            if (diff > 0.01) { // More than 1 cent difference
                differences.push({
                    id: pgContract.id,
                    description: pgContract.description,
                    pgOverdue,
                    fsOverdue,
                    diff
                });
            }
        }

        // Sort by difference (largest first)
        differences.sort((a, b) => b.diff - a.diff);

        console.log('\n' + '='.repeat(80));
        console.log('TOTALI');
        console.log('='.repeat(80));
        console.log(`PostgreSQL Total Overdue: €${pgTotalOverdue.toFixed(2)}`);
        console.log(`Firestore Total Overdue:  €${fsTotalOverdue.toFixed(2)}`);
        console.log(`Differenza:               €${(fsTotalOverdue - pgTotalOverdue).toFixed(2)}`);

        if (differences.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log(`CONTRATTI CON DIFFERENZE (${differences.length} totali)`);
            console.log('='.repeat(80));
            console.log();

            differences.forEach((item, index) => {
                if (index < 20) { // Show top 20
                    console.log(`${index + 1}. ${item.description || item.id}`);
                    console.log(`   PostgreSQL: €${item.pgOverdue.toFixed(2)}`);
                    console.log(`   Firestore:  €${item.fsOverdue.toFixed(2)}`);
                    console.log(`   Diff:       €${item.diff.toFixed(2)}`);
                    console.log();
                }
            });

            if (differences.length > 20) {
                console.log(`... e altri ${differences.length - 20} contratti con differenze minori\n`);
            }

            // Show top 5 contributors to the difference
            console.log('='.repeat(80));
            console.log('TOP 5 CONTRATTI CHE CONTRIBUISCONO ALLA DIFFERENZA');
            console.log('='.repeat(80));
            const top5 = differences.slice(0, 5);
            const top5Total = top5.reduce((sum, item) => sum + item.diff, 0);
            top5.forEach((item, index) => {
                console.log(`${index + 1}. ${item.description || item.id}: €${item.diff.toFixed(2)}`);
            });
            console.log(`\nTotale top 5: €${top5Total.toFixed(2)} (${((top5Total / Math.abs(fsTotalOverdue - pgTotalOverdue)) * 100).toFixed(1)}% della differenza)`);
        } else {
            console.log('\n✓ Nessuna differenza trovata! I calcoli coincidono.');
        }

    } catch (error) {
        console.error('Errore durante il confronto:', error);
    } finally {
        await prisma.$disconnect();
        await admin.app().delete();
    }
}

compareOverdue();
