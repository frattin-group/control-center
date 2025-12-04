const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Firebase Admin
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateContractLineItems() {
    try {
        console.log('Starting contract line items migration...');

        // Fetch all contracts from Firestore
        const snapshot = await db.collection('contracts').get();

        if (snapshot.empty) {
            console.log('No contracts found in Firestore.');
            return;
        }

        let processedCount = 0;
        let errorCount = 0;

        // Pre-fetch maps for ID resolution
        const sectors = await prisma.sector.findMany();
        const sectorMap = new Map(sectors.map(s => [s.name, s.id])); // Map by Name as fallback, but ideally by ID if matches
        // Actually, Firestore might store IDs. Let's assume IDs first.
        // But wait, previous migrations might have generated new UUIDs for sectors?
        // In migrate-master-data.js, we used upsert with name? No, we used ID if available or generated new.
        // Let's check migrate-master-data.js strategy. 
        // It used `id: doc.id` for sectors. So IDs should match Firestore IDs!

        // So we can trust IDs.

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const contractId = doc.id;
            const lineItems = data.lineItems || [];

            if (lineItems.length === 0) continue;

            // Check if contract exists in Prisma
            const contractExists = await prisma.contract.findUnique({ where: { id: contractId } });
            if (!contractExists) {
                console.warn(`Contract ${contractId} not found in Prisma. Skipping line items.`);
                continue;
            }

            for (const item of lineItems) {
                try {
                    // Map fields
                    const totalAmount = parseFloat(item.totalAmount) || 0;
                    const startDate = item.startDate ? new Date(item.startDate) : new Date();
                    const endDate = item.endDate ? new Date(item.endDate) : new Date();
                    const description = item.description || '';

                    // Resolve relations
                    // Firestore might have sectorId, sectorld, etc.
                    const sectorId = item.sectorId || item.sectorld || null;
                    const marketingChannelId = item.marketingChannelId || null;
                    const branchId = item.branchId || item.branchld || item.assignmentId || null; // assignmentId often used for branch

                    // Verify relations exist to avoid FK errors
                    let validSectorId = null;
                    if (sectorId) {
                        const exists = await prisma.sector.findUnique({ where: { id: sectorId } });
                        if (exists) validSectorId = sectorId;
                    }

                    let validChannelId = null;
                    if (marketingChannelId) {
                        const exists = await prisma.marketingChannel.findUnique({ where: { id: marketingChannelId } });
                        if (exists) validChannelId = marketingChannelId;
                    }

                    let validBranchId = null;
                    if (branchId) {
                        const exists = await prisma.branch.findUnique({ where: { id: branchId } });
                        if (exists) validBranchId = branchId;
                    }

                    await prisma.contractLineItem.create({
                        data: {
                            contractId: contractId,
                            description: description,
                            totalAmount: totalAmount,
                            startDate: startDate,
                            endDate: endDate,
                            sectorId: validSectorId,
                            marketingChannelId: validChannelId,
                            branchId: validBranchId
                        }
                    });

                } catch (innerError) {
                    console.error(`Error processing line item for contract ${contractId}:`, innerError);
                    errorCount++;
                }
            }
            processedCount++;
        }

        console.log(`Migration completed. Processed ${processedCount} contracts with line items. Errors: ${errorCount}`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateContractLineItems();
