const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateMasterData() {
    try {
        console.log('Starting master data migration...');

        // Sectors
        console.log('Migrating Sectors...');
        const sectorsSnap = await db.collection('sectors').get();
        for (const doc of sectorsSnap.docs) {
            const data = doc.data();
            await prisma.sector.upsert({
                where: { id: doc.id },
                update: { name: data.name },
                create: { id: doc.id, name: data.name }
            });
        }
        console.log(`Migrated ${sectorsSnap.size} sectors.`);

        // Branches
        console.log('Migrating Branches...');
        const branchesSnap = await db.collection('branches').get();
        for (const doc of branchesSnap.docs) {
            const data = doc.data();
            await prisma.branch.upsert({
                where: { id: doc.id },
                update: {
                    name: data.name,
                    city: data.city,
                    address: data.address
                },
                create: {
                    id: doc.id,
                    name: data.name,
                    city: data.city,
                    address: data.address
                }
            });
        }
        console.log(`Migrated ${branchesSnap.size} branches.`);

        // Suppliers
        console.log('Migrating Suppliers...');
        const suppliersSnap = await db.collection('channels').get(); // 'channels' collection is for suppliers
        for (const doc of suppliersSnap.docs) {
            const data = doc.data();
            await prisma.supplier.upsert({
                where: { id: doc.id },
                update: { name: data.name, vatNumber: data.vatNumber, address: data.address },
                create: { id: doc.id, name: data.name, vatNumber: data.vatNumber, address: data.address }
            });
        }
        console.log(`Migrated ${suppliersSnap.size} suppliers.`);

        // Channel Categories
        console.log('Migrating Channel Categories...');
        const categoriesSnap = await db.collection('channel_categories').get();
        for (const doc of categoriesSnap.docs) {
            const data = doc.data();
            await prisma.channelCategory.upsert({
                where: { id: doc.id },
                update: { name: data.name },
                create: { id: doc.id, name: data.name }
            });
        }
        console.log(`Migrated ${categoriesSnap.size} channel categories.`);

        // Marketing Channels
        console.log('Migrating Marketing Channels...');
        const marketingChannelsSnap = await db.collection('marketing_channels').get();
        for (const doc of marketingChannelsSnap.docs) {
            const data = doc.data();
            // Ensure category exists or handle null
            let categoryId = data.categoryId || null;
            if (categoryId) {
                const categoryExists = await prisma.channelCategory.findUnique({ where: { id: categoryId } });
                if (!categoryExists) {
                    console.warn(`Category ${categoryId} not found for channel ${doc.id}. Setting to null.`);
                    categoryId = null;
                }
            }

            await prisma.marketingChannel.upsert({
                where: { id: doc.id },
                update: { name: data.name, categoryId: categoryId },
                create: { id: doc.id, name: data.name, categoryId: categoryId }
            });
        }
        console.log(`Migrated ${marketingChannelsSnap.size} marketing channels.`);

        console.log('Master data migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateMasterData();
