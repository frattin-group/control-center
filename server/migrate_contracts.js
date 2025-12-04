const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateContracts() {
    console.log('Starting contracts migration...');

    try {
        const snapshot = await db.collection('contracts').get();
        console.log(`Found ${snapshot.size} contracts in Firestore.`);

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const contractId = doc.id;

            console.log(`Migrating contract ${contractId}...`);

            // Check if supplier exists, if not, skip or handle (for now we assume supplier exists or we skip)
            // Ideally we should map supplierId. If supplierId is missing, we can't create the contract easily due to foreign key.
            // Let's check if supplier exists in PG.
            if (!data.supplierld) {
                console.warn(`Skipping contract ${contractId}: No supplierId`);
                continue;
            }

            const supplierExists = await prisma.supplier.findUnique({ where: { id: data.supplierld } });
            if (!supplierExists) {
                console.warn(`Skipping contract ${contractId}: Supplier ${data.supplierld} not found in DB`);
                continue;
            }

            const signingDate = data.signingDate ? new Date(data.signingDate) : new Date();

            // Create Contract
            const newContract = await prisma.contract.create({
                data: {
                    id: contractId, // Keep same ID if possible, or let UUID gen if format differs. Firestore IDs are strings, UUIDs are strings.
                    supplierId: data.supplierld,
                    signingDate: signingDate,
                    description: data.description || '',
                    amount: parseFloat(data.totalAmount) || 0,
                    contractPdfUrl: data.contractPdfUrl || null,
                    createdAt: data.createdAt ? new Date(data.createdAt.toDate()) : new Date(),
                    updatedAt: new Date()
                }
            });

            // Migrate Line Items
            if (data.lineItems && Array.isArray(data.lineItems)) {
                for (const item of data.lineItems) {
                    await prisma.contractLineItem.create({
                        data: {
                            contractId: newContract.id,
                            description: item.description || '',
                            totalAmount: parseFloat(item.totalAmount) || 0,
                            startDate: item.startDate ? new Date(item.startDate) : new Date(),
                            endDate: item.endDate ? new Date(item.endDate) : new Date(),
                            sectorId: item.sectorld || null,
                            marketingChannelId: null, // Map if available
                            branchId: item.branchld || null
                        }
                    });
                }
            }
        }

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateContracts();
