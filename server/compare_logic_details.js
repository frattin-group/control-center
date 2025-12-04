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

const dayMs = 24 * 60 * 60 * 1000;

// OLD LOGIC
function calculateOverdueOld(contract, expenses, today) {
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
                    } else {
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
    });

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
                if (today >= start) {  // KEY DIFFERENCE
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

// NEW LOGIC (with proportional distribution)
function calculateOverdueNew(contract, expenses, today) {
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

                    // NEW LOGIC: Proportional distribution instead of first item
                    if (activeLineItems.length === 0) {
                        const totalAll = sortedLineItems.reduce((sum, li) => sum + (parseFloat(li.totalAmount) || 0), 0);
                        if (totalAll > 0) {
                            sortedLineItems.forEach(li => {
                                const share = (parseFloat(li.totalAmount) || 0) / totalAll * amount;
                                lineItemSpent.set(li._normalizedId, (lineItemSpent.get(li._normalizedId) || 0) + share);
                                if (isUpToToday) {
                                    lineItemSpentToDate.set(li._normalizedId, (lineItemSpentToDate.get(li._normalizedId) || 0) + share);
                                }
                            });
                        }
                    } else {
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
    });

    let totalOverdue = 0;
    normalizedLineItems.forEach(li => {
        const total = parseFloat(li.totalAmount) || 0;
        const spent = lineItemSpent.get(li._normalizedId) || 0;
        const spentUpToToday = lineItemSpentToDate.get(li._normalizedId) || 0;
        const remaining = Math.max(0, total - spent);
        let overdue = 0;

        if (total > 0 && li.startDate && li.endDate) {
            const startDate = new Date(li.startDate);
            const endDate = new Date(li.endDate);
            if (!isNaN(startDate) && !isNaN(endDate)) {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(0, 0, 0, 0);
                // NEW LOGIC: No check for today >= start
                const totalDays = Math.ceil((endDate - startDate) / dayMs) + 1;
                const contractEndOrToday = endDate < today ? endDate : today;
                const elapsedDays = Math.max(0, Math.ceil((contractEndOrToday - startDate) / dayMs) + 1);
                if (elapsedDays > 0) {
                    const expectedToDate = (total / totalDays) * elapsedDays;
                    const shortfall = expectedToDate - Math.min(spentUpToToday, expectedToDate);
                    overdue = Math.max(0, Math.min(remaining, shortfall));
                }
            }
        }
        totalOverdue += overdue;
    });

    return totalOverdue;
}

async function compareLogics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const contractsSnapshot = await db.collection('contracts').get();
    const expensesSnapshot = await db.collection('expenses').get();

    const contracts = contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const expenses = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log('='.repeat(80));
    console.log('COMPARISON: OLD vs NEW OVERDUE LOGIC');
    console.log('='.repeat(80));
    console.log();

    let oldTotal = 0;
    let newTotal = 0;
    const differences = [];

    contracts.forEach(contract => {
        const oldOverdue = calculateOverdueOld(contract, expenses, today);
        const newOverdue = calculateOverdueNew(contract, expenses, today);

        oldTotal += oldOverdue;
        newTotal += newOverdue;

        const diff = oldOverdue - newOverdue;
        if (Math.abs(diff) > 0.01) {
            differences.push({
                id: contract.id,
                description: contract.description,
                oldOverdue,
                newOverdue,
                diff
            });
        }
    });

    differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    console.log(`OLD LOGIC TOTAL: €${oldTotal.toFixed(2)}`);
    console.log(`NEW LOGIC TOTAL: €${newTotal.toFixed(2)}`);
    console.log(`DIFFERENCE:      €${(oldTotal - newTotal).toFixed(2)}`);
    console.log();
    console.log(`Expected difference: €9,406.24`);
    console.log(`Actual difference:   €${(oldTotal - newTotal).toFixed(2)}`);
    console.log();

    console.log('='.repeat(80));
    console.log(`CONTRACTS WITH DIFFERENCES (${differences.length} total)`);
    console.log('='.repeat(80));
    console.log();

    differences.slice(0, 15).forEach((item, i) => {
        console.log(`${i + 1}. ${item.description || item.id}`);
        console.log(`   Old: €${item.oldOverdue.toFixed(2)}`);
        console.log(`   New: €${item.newOverdue.toFixed(2)}`);
        console.log(`   Diff: €${item.diff.toFixed(2)} ${item.diff > 0 ? '(OLD HIGHER)' : '(NEW HIGHER)'}`);
        console.log();
    });

    await prisma.$disconnect();
    await admin.app().delete();
}

compareLogics();
