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

async function migrate() {
    try {
        console.log('Starting migration...');

        // Map to store Firestore ID -> DB ID for users (in case of merge)
        const firestoreIdToDbId = new Map();

        // 1. Users
        console.log('Migrating Users...');
        const usersSnap = await db.collection('users').get();
        for (const doc of usersSnap.docs) {
            const data = doc.data();

            // Check if user exists by email
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email }
            });

            let userId = doc.id;

            if (existingUser) {
                console.log(`User ${data.email} already exists (ID: ${existingUser.id}). Mapping Firestore ID ${doc.id} to DB ID.`);
                userId = existingUser.id;
                firestoreIdToDbId.set(doc.id, userId);

                // Update existing user data if needed (optional)
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        name: data.name || existingUser.name,
                        role: data.role || existingUser.role,
                    }
                });
            } else {
                await prisma.user.upsert({
                    where: { id: doc.id },
                    update: {},
                    create: {
                        id: doc.id,
                        email: data.email,
                        name: data.name,
                        role: data.role || 'collaborator',
                        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                    }
                });
                firestoreIdToDbId.set(doc.id, doc.id);
            }

            // Handle Assigned Channels (Suppliers)
            if (data.assignedChannels && Array.isArray(data.assignedChannels)) {
                // We need to wait for Suppliers to be migrated first? 
                // No, we can migrate assignments later or just ensure suppliers exist.
                // But we haven't migrated suppliers yet. 
                // So we should store assignments and process them after suppliers.
                // Or just migrate Suppliers BEFORE Users? No, usually Users first.
                // We will process assignments in a separate pass or at the end.
            }
        }
        console.log(`Migrated ${usersSnap.size} users.`);

        // 2. Sectors
        console.log('Migrating Sectors...');
        const sectorsSnap = await db.collection('sectors').get();
        for (const doc of sectorsSnap.docs) {
            const data = doc.data();
            await prisma.sector.upsert({
                where: { id: doc.id },
                update: {},
                create: { id: doc.id, name: data.name }
            });
        }
        console.log(`Migrated ${sectorsSnap.size} sectors.`);

        // 3. Suppliers (from 'channels' collection)
        console.log('Migrating Suppliers (from channels)...');
        const channelsSnap = await db.collection('channels').get();
        for (const doc of channelsSnap.docs) {
            const data = doc.data();
            await prisma.supplier.upsert({
                where: { id: doc.id },
                update: {},
                create: {
                    id: doc.id,
                    name: data.name,
                    // vatNumber/address might not be in 'channels' but in 'suppliers' collection?
                }
            });
        }
        console.log(`Migrated ${channelsSnap.size} suppliers (from channels).`);

        // 3b. Suppliers (from 'suppliers' collection - merge/update)
        console.log('Migrating Suppliers (from suppliers collection)...');
        const suppliersSnap = await db.collection('suppliers').get();
        for (const doc of suppliersSnap.docs) {
            const data = doc.data();
            // Upsert to update with details if exists, or create
            await prisma.supplier.upsert({
                where: { id: doc.id },
                update: {
                    vatNumber: data.vatNumber,
                    address: data.address,
                },
                create: {
                    id: doc.id,
                    name: data.name,
                    vatNumber: data.vatNumber,
                    address: data.address,
                }
            });
        }
        console.log(`Migrated ${suppliersSnap.size} suppliers (from suppliers collection).`);

        // 4. Marketing Channels (from 'marketing_channels' collection)
        console.log('Migrating Marketing Channels...');
        const marketingChannelsSnap = await db.collection('marketing_channels').get();
        for (const doc of marketingChannelsSnap.docs) {
            const data = doc.data();
            await prisma.marketingChannel.upsert({
                where: { id: doc.id },
                update: {
                    categoryId: data.categoryId
                },
                create: {
                    id: doc.id,
                    name: data.name,
                    categoryId: data.categoryId
                }
            });
        }
        console.log(`Migrated ${marketingChannelsSnap.size} marketing channels.`);

        // 5. Branches
        console.log('Migrating Branches...');
        const branchesSnap = await db.collection('branches').get();
        for (const doc of branchesSnap.docs) {
            const data = doc.data();
            await prisma.branch.upsert({
                where: { id: doc.id },
                update: {},
                create: { id: doc.id, name: data.name }
            });

            if (data.associatedSectors && Array.isArray(data.associatedSectors)) {
                for (const sectorId of data.associatedSectors) {
                    const sectorExists = await prisma.sector.findUnique({ where: { id: sectorId } });
                    if (sectorExists) {
                        await prisma.branchSector.upsert({
                            where: { branchId_sectorId: { branchId: doc.id, sectorId } },
                            update: {},
                            create: { branchId: doc.id, sectorId }
                        });
                    }
                }
            }
        }
        console.log(`Migrated ${branchesSnap.size} branches.`);

        // 6. User Assignments (now that Suppliers exist)
        console.log('Processing User Assignments...');
        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const userId = firestoreIdToDbId.get(doc.id);

            if (data.assignedChannels && Array.isArray(data.assignedChannels)) {
                // Delete existing assignments first?
                await prisma.supplierAssignment.deleteMany({ where: { userId } });

                for (const supplierId of data.assignedChannels) {
                    const supplierExists = await prisma.supplier.findUnique({ where: { id: supplierId } });
                    if (supplierExists) {
                        await prisma.supplierAssignment.create({
                            data: { userId, supplierId }
                        });
                    }
                }
            }
        }

        // 7. Contracts
        console.log('Migrating Contracts...');
        const contractsSnap = await db.collection('contracts').get();
        for (const doc of contractsSnap.docs) {
            const data = doc.data();
            if (!data.supplierId) continue;

            const supplierExists = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
            if (!supplierExists) {
                console.warn(`Skipping contract ${doc.id}: Supplier ${data.supplierId} not found.`);
                continue;
            }

            await prisma.contract.upsert({
                where: { id: doc.id },
                update: {},
                create: {
                    id: doc.id,
                    supplierId: data.supplierId,
                    signingDate: data.signingDate ? new Date(data.signingDate) : new Date(),
                    description: data.description,
                    amount: data.amount ? parseFloat(data.amount) : null,
                }
            });
        }
        console.log(`Migrated ${contractsSnap.size} contracts.`);

        // 8. Budgets
        console.log('Migrating Budgets...');
        const budgetsSnap = await db.collection('budgets').get();
        for (const doc of budgetsSnap.docs) {
            const data = doc.data();
            if (!data.supplierId) continue;

            const supplierExists = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
            if (!supplierExists) {
                console.warn(`Skipping budget ${doc.id}: Supplier ${data.supplierId} not found.`);
                continue;
            }

            const budget = await prisma.budget.upsert({
                where: { supplierId_year: { supplierId: data.supplierId, year: data.year } },
                update: {},
                create: {
                    id: doc.id,
                    supplierId: data.supplierId,
                    year: data.year,
                }
            });

            // Re-create allocations
            await prisma.budgetAllocation.deleteMany({ where: { budgetId: budget.id } });

            if (data.allocations && Array.isArray(data.allocations)) {
                for (const alloc of data.allocations) {
                    if (alloc.sectorId && !(await prisma.sector.findUnique({ where: { id: alloc.sectorId } }))) continue;
                    if (alloc.marketingChannelId && !(await prisma.marketingChannel.findUnique({ where: { id: alloc.marketingChannelId } }))) continue;
                    if (alloc.branchId && !(await prisma.branch.findUnique({ where: { id: alloc.branchId } }))) continue;

                    try {
                        await prisma.budgetAllocation.create({
                            data: {
                                budgetId: budget.id,
                                sectorId: alloc.sectorId,
                                marketingChannelId: alloc.marketingChannelId,
                                branchId: alloc.branchId,
                                budgetAmount: alloc.budgetAmount || 0,
                            }
                        });
                    } catch (err) {
                        console.warn(`Failed to create budget allocation for budget ${budget.id}:`, err.message);
                    }
                }
            }
        }
        console.log(`Migrated ${budgetsSnap.size} budgets.`);

        // 9. Expenses
        console.log('Migrating Expenses...');
        const expensesSnap = await db.collection('expenses').get();
        for (const doc of expensesSnap.docs) {
            const data = doc.data();
            if (!data.supplierId) continue;

            const supplierExists = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
            if (!supplierExists) {
                console.warn(`Skipping expense ${doc.id}: Supplier ${data.supplierId} not found.`);
                continue;
            }

            const expense = await prisma.expense.upsert({
                where: { id: doc.id },
                update: {
                    invoicePdfUrl: data.invoicePdfUrl,
                    contractPdfUrl: data.contractPdfUrl,
                    relatedContractId: data.relatedContractId,
                    requiresContract: data.requiresContract !== undefined ? data.requiresContract : true,
                    authorId: data.authorId,
                    authorName: data.authorName,
                    isAmortized: data.isAmortized || false,
                    amortizationStartDate: data.amortizationStartDate ? (data.amortizationStartDate.toDate ? data.amortizationStartDate.toDate() : new Date(data.amortizationStartDate)) : null,
                    amortizationEndDate: data.amortizationEndDate ? (data.amortizationEndDate.toDate ? data.amortizationEndDate.toDate() : new Date(data.amortizationEndDate)) : null,
                },
                create: {
                    id: doc.id,
                    supplierId: data.supplierId,
                    date: data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date(),
                    totalAmount: data.amount || 0,
                    description: data.description,
                    costDomain: data.costDomain || 'marketing',
                    isAmortized: data.isAmortized || false,
                    amortizationStartDate: data.amortizationStartDate ? (data.amortizationStartDate.toDate ? data.amortizationStartDate.toDate() : new Date(data.amortizationStartDate)) : null,
                    amortizationEndDate: data.amortizationEndDate ? (data.amortizationEndDate.toDate ? data.amortizationEndDate.toDate() : new Date(data.amortizationEndDate)) : null,
                    invoicePdfUrl: data.invoicePdfUrl,
                    contractPdfUrl: data.contractPdfUrl,
                    relatedContractId: data.relatedContractId,
                    requiresContract: data.requiresContract !== undefined ? data.requiresContract : true,
                    authorId: data.authorId,
                    authorName: data.authorName,
                }
            });

            // Delete existing line items to avoid duplicates on re-run
            await prisma.expenseLineItem.deleteMany({ where: { expenseId: expense.id } });

            const lineItems = data.lineItems || [];
            const itemsToProcess = (lineItems.length > 0) ? lineItems : [{
                amount: data.amount || 0,
                marketingChannelId: data.marketingChannelId || data.marketingChannelld,
                branchId: data.branchId || data.branchld,
                sectorId: data.sectorId || data.sectorld,
                description: data.description
            }];

            // Fallback sectorId from parent
            const parentSectorId = data.sectorId || data.sectorld;

            for (const item of itemsToProcess) {
                // Normalize keys
                item.sectorId = item.sectorId || item.sectorld || parentSectorId;
                item.marketingChannelId = item.marketingChannelId || item.marketingChannelld;
                item.branchId = item.branchId || item.branchld;
                item.assignmentId = item.assignmentId || item.assignmentid || item.assignmentld;

                if (item.sectorId && !(await prisma.sector.findUnique({ where: { id: item.sectorId } }))) item.sectorId = null;
                if (item.marketingChannelId && !(await prisma.marketingChannel.findUnique({ where: { id: item.marketingChannelId } }))) item.marketingChannelId = null;
                if (item.branchId && !(await prisma.branch.findUnique({ where: { id: item.branchId } }))) item.branchId = null;
                if (item.assignmentId && !(await prisma.branch.findUnique({ where: { id: item.assignmentId } }))) item.assignmentId = null;

                // Map relatedContractId to contractId and validate
                let contractId = item.contractId || item.relatedContractId;
                if (contractId && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
                    contractId = null;
                }

                try {
                    await prisma.expenseLineItem.create({
                        data: {
                            expenseId: expense.id,
                            amount: item.amount || 0,
                            description: item.description,
                            sectorId: item.sectorId,
                            marketingChannelId: item.marketingChannelId,
                            branchId: item.branchId || item.assignmentId,
                            contractId: contractId,
                        }
                    });
                } catch (err) {
                    console.warn(`Failed to create line item for expense ${expense.id}:`, err.message);
                }
            }
        }
        console.log(`Migrated ${expensesSnap.size} expenses.`);

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
