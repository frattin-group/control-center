const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugContract() {
    const description = "Abbonamento Annuale Vicenza 2025 - Upgrade";
    console.log(`Searching for contract: "${description}"...`);

    const contract = await prisma.contract.findFirst({
        where: { description: { contains: description } },
        include: { plannedLineItems: true }
    });

    if (!contract) {
        console.log("Contract not found!");
        return;
    }
    contract.lineItems = contract.plannedLineItems;

    console.log(`\nFOUND CONTRACT: ${contract.description} (${contract.id})`);
    console.log(`Total Amount: €${contract.amount}`);
    console.log(`Signing Date: ${contract.signingDate}`);

    console.log("\n--- LINE ITEMS ---");
    contract.lineItems.forEach((li, i) => {
        console.log(`#${i + 1} [${li.id}]`);
        console.log(`   Desc: ${li.description}`);
        console.log(`   Amount: €${li.totalAmount}`);
        console.log(`   Start: ${li.startDate.toISOString()}`);
        console.log(`   End:   ${li.endDate.toISOString()}`);
    });

    console.log("\n--- EXPENSES ---");
    const expenses = await prisma.expense.findMany({
        where: {
            OR: [
                { lineItems: { some: { contractId: contract.id } } },
                { lineItems: { some: { contractId: null, description: { in: contract.lineItems.map(li => li.description) } } } } // Simulate smart linking check
            ]
        },
        include: { lineItems: true }
    });

    console.log("\n--- DISTRIBUTE AMOUNT SIMULATION ---");
    const sortedLineItems = [...contract.lineItems].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    let lineItemSpent = {};
    sortedLineItems.forEach(li => lineItemSpent[li.id] = 0);

    expenses.forEach(exp => {
        const expenseDate = new Date(exp.date);
        expenseDate.setHours(0, 0, 0, 0);
        const amount = exp.totalAmount; // Assuming 1 line item per expense for simplicity or sum

        // Simulate logic
        const activeLineItems = sortedLineItems.filter(li => {
            const start = new Date(li.startDate);
            const end = new Date(li.endDate);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            return expenseDate >= start && expenseDate <= end;
        });

        if (activeLineItems.length > 0) {
            console.log(`Expense ${exp.date.toISOString().split('T')[0]} (€${amount}) -> MATCHED ${activeLineItems.length} items: ${activeLineItems.map(li => li.description).join(', ')}`);
            activeLineItems.forEach(li => lineItemSpent[li.id] += amount / activeLineItems.length);
        } else {
            console.log(`Expense ${exp.date.toISOString().split('T')[0]} (€${amount}) -> NO MATCH. Dumping to first item: ${sortedLineItems[0].description}`);
            lineItemSpent[sortedLineItems[0].id] += amount;
        }
    });

    console.log("\n--- SPENT PER LINE ITEM ---");
    Object.entries(lineItemSpent).forEach(([id, spent]) => {
        const li = contract.lineItems.find(i => i.id === id);
        console.log(`${li.description}: €${spent.toFixed(2)}`);
    });

    // --- CALCULATION LOGIC REPLICATION ---
    console.log("\n--- CALCULATION DEBUG ---");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    contract.lineItems.forEach(li => {
        const total = li.totalAmount;
        const start = new Date(li.startDate);
        const end = new Date(li.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        console.log(`\nLine Item: ${li.description}`);
        console.log(`Start (Local 00:00): ${start.toString()}`);
        console.log(`End (Local 00:00):   ${end.toString()}`);
        console.log(`Today (Local 00:00): ${today.toString()}`);

        if (today >= start) {
            const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
            const effectiveEnd = today > end ? end : today;
            const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((effectiveEnd - start) / dayMs) + 1));

            const expectedToDate = (total / totalDays) * elapsedDays;

            console.log(`Total Days: ${totalDays}`);
            console.log(`Elapsed Days: ${elapsedDays}`);
            console.log(`Expected To Date: €${expectedToDate.toFixed(2)}`);
        } else {
            console.log("Not started yet.");
        }
    });

    await prisma.$disconnect();
}

debugContract();
