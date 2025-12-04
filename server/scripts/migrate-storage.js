require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const { put } = require('@vercel/blob');
const prisma = new PrismaClient();

// Helper to download file as buffer
async function downloadFile(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

async function migrateStorage() {
    console.log("🚀 Starting Storage Migration (Firebase -> Vercel Blob)...");

    // 1. Migrate Expenses (Invoices and Contracts)
    const expenses = await prisma.expense.findMany({
        where: {
            OR: [
                { invoicePdfUrl: { contains: 'firebasestorage.googleapis.com' } },
                { contractPdfUrl: { contains: 'firebasestorage.googleapis.com' } }
            ]
        }
    });

    console.log(`Found ${expenses.length} expenses with Firebase files.`);

    for (const expense of expenses) {
        console.log(`Processing Expense: ${expense.description} (${expense.id})`);
        const updates = {};

        // Migrate Invoice
        if (expense.invoicePdfUrl && expense.invoicePdfUrl.includes('firebasestorage.googleapis.com')) {
            try {
                console.log(`  - Downloading Invoice...`);
                const buffer = await downloadFile(expense.invoicePdfUrl);
                const filename = `migrated_invoice_${expense.id}.pdf`; // Simple naming

                console.log(`  - Uploading to Vercel Blob...`);
                const blob = await put(filename, buffer, { access: 'public' });

                updates.invoicePdfUrl = blob.url;
                console.log(`  ✅ Invoice migrated: ${blob.url}`);
            } catch (e) {
                console.error(`  ❌ Failed to migrate invoice: ${e.message}`);
            }
        }

        // Migrate Contract (on Expense)
        if (expense.contractPdfUrl && expense.contractPdfUrl.includes('firebasestorage.googleapis.com')) {
            try {
                console.log(`  - Downloading Contract (Expense)...`);
                const buffer = await downloadFile(expense.contractPdfUrl);
                const filename = `migrated_expense_contract_${expense.id}.pdf`;

                console.log(`  - Uploading to Vercel Blob...`);
                const blob = await put(filename, buffer, { access: 'public' });

                updates.contractPdfUrl = blob.url;
                console.log(`  ✅ Contract migrated: ${blob.url}`);
            } catch (e) {
                console.error(`  ❌ Failed to migrate contract: ${e.message}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await prisma.expense.update({
                where: { id: expense.id },
                data: updates
            });
            console.log(`  💾 Database updated for Expense ${expense.id}`);
        }
    }

    // 2. Migrate Contracts (Standalone)
    const contracts = await prisma.contract.findMany({
        where: {
            contractPdfUrl: { contains: 'firebasestorage.googleapis.com' }
        }
    });

    console.log(`Found ${contracts.length} contracts with Firebase files.`);

    for (const contract of contracts) {
        console.log(`Processing Contract: ${contract.description} (${contract.id})`);

        try {
            console.log(`  - Downloading Contract...`);
            const buffer = await downloadFile(contract.contractPdfUrl);
            const filename = `migrated_contract_${contract.id}.pdf`;

            console.log(`  - Uploading to Vercel Blob...`);
            const blob = await put(filename, buffer, { access: 'public' });

            await prisma.contract.update({
                where: { id: contract.id },
                data: { contractPdfUrl: blob.url }
            });
            console.log(`  ✅ Contract migrated: ${blob.url}`);
            console.log(`  💾 Database updated for Contract ${contract.id}`);
        } catch (e) {
            console.error(`  ❌ Failed to migrate contract: ${e.message}`);
        }
    }

    console.log("🎉 Migration Complete!");
}

migrateStorage()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
