const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const prisma = new PrismaClient();

async function migrateExtras() {
    try {
        console.log('Starting extra migration...');

        // Channel Categories
        console.log('Migrating Channel Categories...');
        const catsSnap = await db.collection('channel_categories').get();
        for (const doc of catsSnap.docs) {
            const data = doc.data();
            await prisma.channelCategory.upsert({
                where: { id: doc.id },
                update: {},
                create: { id: doc.id, name: data.name }
            });
        }
        console.log(`Migrated ${catsSnap.size} channel categories.`);

        // Geographic Areas
        console.log('Migrating Geographic Areas...');
        const areasSnap = await db.collection('geographic_areas').get();
        for (const doc of areasSnap.docs) {
            const data = doc.data();
            await prisma.geographicArea.upsert({
                where: { id: doc.id },
                update: {},
                create: { id: doc.id, name: data.name }
            });
        }
        console.log(`Migrated ${areasSnap.size} geographic areas.`);

        console.log('Extra migration completed!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateExtras();
