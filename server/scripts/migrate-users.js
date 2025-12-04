const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const prisma = new PrismaClient();

async function migrateUsers() {
    try {
        console.log('Starting user migration...');

        const usersSnap = await db.collection('users').get();
        console.log(`Found ${usersSnap.size} users in Firestore.`);

        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const userId = doc.id;

            console.log(`Migrating user: ${data.name || data.email} (${userId})`);

            // Upsert User
            await prisma.user.upsert({
                where: { id: userId },
                update: {
                    name: data.name,
                    role: data.role,
                },
                create: {
                    id: userId,
                    email: data.email,
                    name: data.name,
                    role: data.role || 'collaborator',
                    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
                }
            });

            // Handle Assigned Channels (Suppliers)
            if (data.assignedChannels && Array.isArray(data.assignedChannels)) {
                // Delete existing assignments
                await prisma.supplierAssignment.deleteMany({ where: { userId } });

                for (const supplierId of data.assignedChannels) {
                    const supplierExists = await prisma.supplier.findUnique({ where: { id: supplierId } });
                    if (supplierExists) {
                        await prisma.supplierAssignment.create({
                            data: { userId, supplierId }
                        });
                    } else {
                        console.warn(`Supplier ${supplierId} not found for user ${userId}`);
                    }
                }
            }
        }

        console.log('User migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateUsers();
