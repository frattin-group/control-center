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

async function inspect() {
    console.log('--- Firestore: marketing_channels ---');
    const snap = await db.collection('marketing_channels').get();
    console.log(`Found ${snap.size} docs.`);
    snap.docs.slice(0, 10).forEach(d => console.log(d.id, d.data().name));

    console.log('\n--- Neon: marketing_channels ---');
    const channels = await prisma.marketingChannel.findMany({ take: 10 });
    console.log(`Found ${await prisma.marketingChannel.count()} records.`);
    channels.forEach(c => console.log(c.id, c.name));

    console.log('\n--- Checking for "A.C.D. Cassola" ---');
    const specific = await prisma.marketingChannel.findFirst({ where: { name: { contains: 'Cassola' } } });
    console.log('Found in Neon:', specific);
}

inspect().catch(console.error).finally(() => prisma.$disconnect());
