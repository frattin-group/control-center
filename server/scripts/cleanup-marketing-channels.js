const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function cleanup() {
    console.log('Starting cleanup of marketing_channels...');

    // 1. Get valid IDs from Firestore
    const snap = await db.collection('marketing_channels').get();
    const validIds = new Set(snap.docs.map(d => d.id));
    console.log(`Found ${validIds.size} valid marketing channels in Firestore.`);

    // 2. Get all IDs from Neon
    const allChannels = await prisma.marketingChannel.findMany({ select: { id: true, name: true } });
    console.log(`Found ${allChannels.length} marketing channels in Neon.`);

    // 3. Identify invalid IDs
    const invalidChannels = allChannels.filter(c => !validIds.has(c.id));
    console.log(`Found ${invalidChannels.length} invalid channels (polluted from suppliers/channels).`);

    if (invalidChannels.length > 0) {
        console.log('Sample invalid channels:', invalidChannels.slice(0, 5).map(c => c.name));

        // 4. Delete invalid channels
        const invalidIds = invalidChannels.map(c => c.id);
        const result = await prisma.marketingChannel.deleteMany({
            where: { id: { in: invalidIds } }
        });
        console.log(`Deleted ${result.count} invalid records.`);
    } else {
        console.log('No invalid records found.');
    }
}

cleanup().catch(console.error).finally(() => prisma.$disconnect());
