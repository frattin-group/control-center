const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectDoc() {
    try {
        console.log('Inspecting contracts collection...');
        const collectionName = 'contracts';
        const snapshot = await db.collection(collectionName).limit(1).get();

        if (snapshot.empty) {
            console.log('No documents found in contracts');
            return;
        }

        snapshot.forEach(doc => {
            console.log(`ID: ${doc.id}`);
            const data = doc.data();
            console.log('LineItems:', JSON.stringify(data.lineItems, null, 2));
        });
    } catch (error) {
        console.error('Inspection failed:', error);
    }
}

inspectDoc();
