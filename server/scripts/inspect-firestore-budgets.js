const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspect() {
    console.log('Listing collections...');
    const collections = await db.listCollections();
    collections.forEach(c => console.log(c.id));

    console.log('\nChecking "budgets" collection...');
    const budgets = await db.collection('budgets').limit(5).get();
    budgets.forEach(doc => console.log(doc.id, doc.data()));

    console.log('\nChecking "sector_budgets" collection...');
    const sectorBudgets = await db.collection('sector_budgets').limit(5).get();
    sectorBudgets.forEach(doc => console.log(doc.id, doc.data()));

    console.log('\nChecking "sectors" collection for nested budgets...');
    const sectors = await db.collection('sectors').limit(5).get();
    sectors.forEach(doc => console.log(doc.id, doc.data()));
}

inspect();
