const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function inspectFirestoreStructure() {
    // Get one contract with lineItems
    const contractsSnapshot = await db.collection('contracts').limit(5).get();

    console.log('\n=== CONTRACTS STRUCTURE ===\n');
    contractsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`Contract ID: ${doc.id}`);
        console.log(`Description: ${data.description || 'N/A'}`);
        console.log(`Has plannedLineItems: ${!!data.plannedLineItems}`);
        if (data.plannedLineItems) {
            console.log(`  Type: ${Array.isArray(data.plannedLineItems) ? 'Array' : typeof data.plannedLineItems}`);
            console.log(`  Length: ${data.plannedLineItems.length}`);
            if (data.plannedLineItems.length > 0) {
                console.log(`  First item:`, JSON.stringify(data.plannedLineItems[0], null, 2));
            }
        }
        console.log('\n---\n');
    });

    // Get one expense with lineItems
    const expensesSnapshot = await db.collection('expenses').where('relatedContractId', '!=', null).limit(3).get();

    console.log('\n=== EXPENSES STRUCTURE===\n');
    expensesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`Expense ID: ${doc.id}`);
        console.log(`Related Contract ID: ${data.relatedContractId || 'N/A'}`);
        console.log(`Has lineItems: ${!!data.lineItems}`);
        if (data.lineItems && data.lineItems.length > 0) {
            console.log(`  Length: ${data.lineItems.length}`);
            console.log(`  First item:`, JSON.stringify(data.lineItems[0], null, 2));
        }
        console.log('\n---\n');
    });

    await admin.app().delete();
}

inspectFirestoreStructure()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
