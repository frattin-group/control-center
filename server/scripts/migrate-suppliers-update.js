const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('Error: service-account.json not found in server directory.');
    process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateSuppliersUpdate() {
    console.log('Starting Supplier Update Migration...');

    try {
        const collections = await db.listCollections();
        console.log('Collections:', collections.map(c => c.id));

        let updatedCount = 0;

        // 1. Migrate from 'channels' collection (where associatedSectors likely are)
        const channelsSnapshot = await db.collection('channels').get();
        console.log(`Found ${channelsSnapshot.size} documents in 'channels'.`);

        for (const doc of channelsSnapshot.docs) {
            const data = doc.data();
            const supplierId = doc.id;

            // Extract fields
            const associatedSectors = Array.isArray(data.associatedSectors) ? data.associatedSectors : [];
            const offeredMarketingChannels = Array.isArray(data.offeredMarketingChannels) ? data.offeredMarketingChannels : [];

            if (associatedSectors.length > 0 || offeredMarketingChannels.length > 0) {
                try {
                    await prisma.supplier.update({
                        where: { id: supplierId },
                        data: {
                            associatedSectors: associatedSectors,
                            offeredMarketingChannels: offeredMarketingChannels
                        }
                    });
                    updatedCount++;
                    if (updatedCount % 10 === 0) process.stdout.write('.');
                } catch (e) {
                    // Ignore if supplier doesn't exist (shouldn't happen if migrate.js ran)
                    // console.warn(`Supplier ${supplierId} not found or update failed: ${e.message}`);
                }
            }
        }

        // 2. Migrate from 'suppliers' collection (if any)
        const suppliersSnapshot = await db.collection('suppliers').get();
        console.log(`\nFound ${suppliersSnapshot.size} documents in 'suppliers'.`);

        console.log(`\n\nMigration complete. Updated ${updatedCount} suppliers.`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateSuppliersUpdate();
