const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugContract() {
    const description = "Abbonamento Annuale Vicenza 2025 - Upgrade";
    console.log(`Searching for contract: "${description}"...`);

    const contract = await prisma.contract.findFirst({
        where: { description: { contains: description } },
        include: { lineItems: true }
    });

    if (!contract) {
        console.log("Contract not found!");
        return;
    }

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

    let totalSpent = 0;
    expenses.forEach(exp => {
        exp.lineItems.forEach(item => {
            let isLinked = false;
            // Direct link
            if (item.contractId === contract.id) isLinked = true;
            // Smart link (approximate check for debug)
            if (!item.contractId && contract.lineItems.some(li => li.description.trim().toLowerCase() === (item.description || '').trim().toLowerCase())) {
                isLinked = true;
            }

            if (isLinked) {
                console.log(`Expense: ${exp.date.toISOString()} - €${item.amount} - ${item.description}`);
                totalSpent += item.amount;
            }
        });
    });

    console.log(`\nTotal Spent (Calculated): €${totalSpent}`);

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
