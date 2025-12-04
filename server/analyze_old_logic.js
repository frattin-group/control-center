const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

const prisma = new PrismaClient();

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// OLD LOGIC (from ContractsPage.old.jsx)
function calculateOverdueOld(contract, expenses, today) {
    const dayMs = 24 * 60 * 60 * 1000;
    const normalizedLineItems = (contract.lineItems || []).map((item, index) => ({
        ...item,
        _normalizedId: item.id || item._key || `${contract.id}-line-${index}`
    }));

    const lineItemSpent = new Map();
    const lineItemSpentToDate = new Map();
    normalizedLineItems.forEach(li => {
        lineItemSpent.set(li._normalizedId, 0);
        lineItemSpentToDate.set(li._normalizedId, 0);
    });

    const sortedLineItems = [...normalizedLineItems].sort((a, b) => {
        const startA = a.startDate ? new Date(a.startDate) : null;
        const startB = b.startDate ? new Date(b.startDate) : null;
        if (!startA && !startB) return 0;
        if (!startA) return 1;
        if (!startB) return -1;
        return startA - startB;
    });

    // Allocate expenses
    expenses.forEach(expense => {
        const expenseDate = expense.date ? (expense.date.toDate ? expense.date.toDate() : new Date(expense.date)) : null;
        if (expenseDate) expenseDate.setHours(0, 0, 0, 0);
        const isUpToToday = !expenseDate || expenseDate <= today;

        let handled = false;
        (expense.lineItems || []).forEach(item => {
            if ((item.relatedContractId || item.contractId) === contract.id) {
                handled = true;
                const amount = parseFloat(item.amount) || 0;
                const liId = item.relatedLineItemId || item.relatedLineItemID;

                // Try to find normalized ID
                let normalizedId = null;
                for (const li of normalizedLineItems) {
                    if (li.id === liId || li._key === liId || li._normalizedId === liId) {
                        normalizedId = li._normalizedId;
                        break;
                    }
                }

                if (normalizedId) {
                    lineItemSpent.set(normalizedId, (lineItemSpent.get(normalizedId) || 0) + amount);
                    if (isUpToToday) {
                        lineItemSpentToDate.set(normalizedId, (lineItemSpentToDate.get(normalizedId) || 0) + amount);
                    }
                } else {
                    // Distribute (OLD LOGIC: allocate to FIRST item if no active items)
                    if (!sortedLineItems.length || amount === 0) return;
                    const activeLineItems = expenseDate
                        ? sortedLineItems.filter(li => {
                            if (!li.startDate || !li.endDate) return false;
                            const start = new Date(li.startDate);
                            const end = new Date(li.endDate);
                            start.setHours(0, 0, 0, 0);
                            end.setHours(0, 0, 0, 0);
                            return expenseDate >= start && expenseDate <= end;
                        })
                        : [];

                    if (activeLineItems.length === 0) {
                        // OLD LOGIC: Allocate to FIRST item
                        const firstId = sortedLineItems[0]._normalizedId;
                        lineItemSpent.set(firstId, (lineItemSpent.get(firstId) || 0) + amount);
                        if (isUpToToday) {
                            lineItemSpentToDate.set(firstId, (lineItemSpentToDate.get(firstId) || 0) + amount);
                        }
                    } else {
                        // Proportional distribution
                        const totalActive = activeLineItems.reduce((sum, li) => sum + (parseFloat(li.totalAmount) || 0), 0);
                        if (totalActive <= 0) {
                            const share = amount / activeLineItems.length;
                            activeLineItems.forEach(li => {
                                lineItemSpent.set(li._normalizedId, (lineItemSpent.get(li._normalizedId) || 0) + share);
                                if (isUpToToday) {
                                    lineItemSpentToDate.set(li._normalizedId, (lineItemSpentToDate.get(li._normalizedId) || 0) + share);
                                }
                            });
                        } else {
                            activeLineItems.forEach(li => {
                                const liTotal = parseFloat(li.totalAmount) || 0;
                                const share = (liTotal / totalActive) * amount;
                                lineItemSpent.set(li._normalizedId, (lineItemSpent.get(li._normalizedId) || 0) + share);
                                if (isUpToToday) {
                                    lineItemSpentToDate.set(li._normalizedId, (lineItemSpentToDate.get(li._normalizedId) || 0) + share);
                                }
                            });
                        }
                    }
                }
            }
        });

        if (!handled && (expense.relatedContractId || expense.contractId) === contract.id) {
            // Same distribution logic
            const amount = parseFloat(expense.amount) || 0;
            if (!sortedLineItems.length || amount === 0) return;
            const activeLineItems = expenseDate
                ? sortedLineItems.filter(li => {
                    if (!li.startDate || !li.endDate) return false;
                    const start = new Date(li.startDate);
                    const end = new Date(li.endDate);
                    start.setHours(0, 0, 0, 0);
                    end.setHours(0, 0, 0, 0);
                    return expenseDate >= start && expenseDate <= end;
                })
                : [];

            if (activeLineItems.length === 0) {
                const firstId = sortedLineItems[0]._normalizedId;
                lineItemSpent.set(firstId, (lineItemSpent.get(firstId) || 0) + amount);
                if (isUpToToday) {
                    lineItemSpentToDate.set(firstId, (lineItemSpentToDate.get(firstId) || 0) + amount);
                }
            }
        }
    });

    // Calculate overdue (OLD LOGIC)
    let totalOverdue = 0;
    normalizedLineItems.forEach(li => {
        const total = parseFloat(li.totalAmount) || 0;
        const spent = lineItemSpent.get(li._normalizedId) || 0;
        const spentUpToToday = lineItemSpentToDate.get(li._normalizedId) || 0;
        const remaining = Math.max(0, total - spent);
        let overdue = 0;

        if (total > 0 && li.startDate && li.endDate) {
            const start = new Date(li.startDate);
            const end = new Date(li.endDate);
            if (!isNaN(start) && !isNaN(end)) {
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                // OLD LOGIC: Check if today >= start
                if (today >= start) {
                    const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
                    const effectiveEnd = today > end ? end : today;
                    const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((effectiveEnd - start) / dayMs) + 1));
                    if (elapsedDays > 0) {
                        const expectedToDate = (total / totalDays) * elapsedDays;
                        const shortfall = expectedToDate - Math.min(spentUpToToday, expectedToDate);
                        overdue = Math.max(0, Math.min(remaining, shortfall));
                    }
                }
            }
        }
        totalOverdue += overdue;
    });

    return totalOverdue;
}

async function findDifference() {
    console.log('Analyzing overdue calculation differences...\n');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch data
    const contractsSnapshot = await db.collection('contracts').get();
    const expensesSnapshot = await db.collection('expenses').get();

    const contracts = contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const expenses = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`Analyzing ${contracts.length} contracts with ${expenses.length} expenses\n`);

    let oldTotal = 0;
    const contractDetails = [];

    contracts.forEach(contract => {
        const oldOverdue = calculateOverdueOld(contract, expenses, today);
        oldTotal += oldOverdue;

        if (oldOverdue > 0) {
            contractDetails.push({
                id: contract.id,
                description: contract.description,
                overdue: oldOverdue
            });
        }
    });

    contractDetails.sort((a, b) => b.overdue - a.overdue);

    console.log('OLD APP (Firestore logic) TOTAL OVERDUE:', oldTotal.toFixed(2));
    console.log('\nExpected from user: 65,921.90');
    console.log('Calculated: ' + oldTotal.toFixed(2));
    console.log('Match:', Math.abs(oldTotal - 65921.90) < 1 ? 'YES ✓' : 'NO ✗');

    console.log('\n=== TOP 10 CONTRACTS WITH OVERDUE ===');
    contractDetails.slice(0, 10).forEach((c, i) => {
        console.log(`${i + 1}. ${c.description || c.id}: €${c.overdue.toFixed(2)}`);
    });

    await prisma.$disconnect();
    await admin.app().delete();
}

findDifference();
