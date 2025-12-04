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

async function migrateContracts() {
    try {
        console.log('Starting contracts migration...');

        const contractsSnap = await db.collection('contracts').get();
        console.log(`Found ${contractsSnap.size} contracts in Firestore.`);

        for (const doc of contractsSnap.docs) {
            const data = doc.data();

            // Check if supplier exists
            if (!data.supplierld && !data.supplierId) {
                console.warn(`Contract ${doc.id} has no supplierId, skipping.`);
                continue;
            }
            const supplierId = data.supplierId || data.supplierld;
            const supplierExists = await prisma.supplier.findUnique({ where: { id: supplierId } });
            if (!supplierExists) {
                console.warn(`Supplier ${supplierId} not found for contract ${doc.id}, skipping.`);
                continue;
            }

            // Parse dates
            let signingDate = new Date();
            if (data.signingDate) {
                if (data.signingDate.toDate) signingDate = data.signingDate.toDate();
                else signingDate = new Date(data.signingDate);
            }

            let createdAt = new Date();
            if (data.createdAt) {
                if (data.createdAt.toDate) createdAt = data.createdAt.toDate();
                else createdAt = new Date(data.createdAt);
            }

            let updatedAt = new Date();
            if (data.updatedAt) {
                if (data.updatedAt.toDate) updatedAt = data.updatedAt.toDate();
                else updatedAt = new Date(data.updatedAt);
            }

            await prisma.contract.upsert({
                where: { id: doc.id },
                update: {
                    supplierId: supplierId,
                    signingDate: signingDate,
                    description: data.description,
                    amount: data.totalAmount || data.amount || 0,
                    contractPdfUrl: data.contractPdfUrl,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                },
                create: {
                    id: doc.id,
                    supplierId: supplierId,
                    signingDate: signingDate,
                    description: data.description,
                    amount: data.totalAmount || data.amount || 0,
                    contractPdfUrl: data.contractPdfUrl,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                }
            });
        }

        console.log('Contracts migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateContracts();
