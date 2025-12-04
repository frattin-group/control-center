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

async function migrateEmployees() {
    try {
        console.log('Starting employee migration...');

        const employeesSnap = await db.collection('employees').get();
        console.log(`Found ${employeesSnap.size} employees in Firestore.`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const doc of employeesSnap.docs) {
            const data = doc.data();
            const employeeId = doc.id;

            console.log(`Processing employee: ${data.name} (${employeeId})`);

            // Validate Branch
            let branchId = data.branchId;
            if (branchId) {
                const branchExists = await prisma.branch.findUnique({ where: { id: branchId } });
                if (!branchExists) {
                    console.warn(`Branch ${branchId} not found for employee ${data.name}. Setting to null.`);
                    branchId = null;
                }
            }

            // Validate Sector
            let sectorId = data.sectorId;
            if (sectorId) {
                const sectorExists = await prisma.sector.findUnique({ where: { id: sectorId } });
                if (!sectorExists) {
                    console.warn(`Sector ${sectorId} not found for employee ${data.name}. Setting to null.`);
                    sectorId = null;
                }
            }

            // Map fields
            // Firestore jobTitle -> Prisma jobTitle
            // Firestore role -> Prisma role (if exists)

            try {
                await prisma.employee.upsert({
                    where: { id: employeeId },
                    update: {
                        name: data.name,
                        jobTitle: data.jobTitle || data.role, // Map role to jobTitle if jobTitle missing, or keep separate?
                        role: data.role,
                        department: data.department,
                        branchId: branchId || null,
                        sectorId: sectorId || null,
                        status: data.status || 'active',
                        monthlyCost: parseFloat(data.monthlyCost) || 0,
                        monthlyCosts: data.monthlyCosts || {},
                        monthlyCostsByYear: data.monthlyCostsByYear || {},
                        employmentType: data.employmentType || 'full_time',
                        defaultYear: data.defaultYear,
                        notes: data.notes,
                        updatedAt: new Date(), // Update timestamp
                    },
                    create: {
                        id: employeeId,
                        name: data.name,
                        jobTitle: data.jobTitle || data.role,
                        role: data.role,
                        department: data.department,
                        branchId: branchId || null,
                        sectorId: sectorId || null,
                        status: data.status || 'active',
                        monthlyCost: parseFloat(data.monthlyCost) || 0,
                        monthlyCosts: data.monthlyCosts || {},
                        monthlyCostsByYear: data.monthlyCostsByYear || {},
                        employmentType: data.employmentType || 'full_time',
                        defaultYear: data.defaultYear,
                        notes: data.notes,
                        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
                        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(),
                    }
                });
                console.log(`Migrated employee: ${data.name}`);
                migratedCount++;
            } catch (err) {
                console.error(`Failed to migrate employee ${data.name} (${employeeId}):`, err);
                skippedCount++;
            }
        }

        console.log(`Migration completed.`);
        console.log(`Successfully migrated: ${migratedCount}`);
        console.log(`Skipped/Failed: ${skippedCount}`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateEmployees();
