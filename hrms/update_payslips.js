/**
 * Adds candidateId (empty string) and payslips (empty array) to all employee records.
 * Run: node update_payslips.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('✗ serviceAccountKey.json not found');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

async function run() {
  console.log('\nBackfilling candidateId + payslips for all employees...\n');
  const snap = await db.collection('employees').get();
  let updated = 0, skipped = 0;
  const batch = db.batch();
  let batchCount = 0;
  const batches = [batch];

  snap.forEach(d => {
    const data = d.data();
    if (data.candidateId !== undefined && Array.isArray(data.payslips)) {
      skipped++;
      return;
    }
    const updates = {};
    if (data.candidateId === undefined) updates.candidateId = "";
    if (!Array.isArray(data.payslips)) updates.payslips = [];
    const currentBatch = batches[batches.length - 1];
    currentBatch.update(d.ref, updates);
    batchCount++;
    updated++;
    if (batchCount >= 400) {
      batches.push(db.batch());
      batchCount = 0;
    }
  });

  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
  }
  console.log(`✓ Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}\n`);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
