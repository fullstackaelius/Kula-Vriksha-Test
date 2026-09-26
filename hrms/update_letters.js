/**
 * One-time update — adds empty `letters` array to all employee records.
 * Run: node update_letters.js
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
  console.log('\nAdding empty letters array to all employees...\n');
  const snap = await db.collection('employees').get();
  let updated = 0, skipped = 0;
  const batch = db.batch();

  snap.forEach(d => {
    const data = d.data();
    if (Array.isArray(data.letters)) {
      skipped++;
    } else {
      batch.update(d.ref, { letters: [] });
      updated++;
    }
  });

  if (updated > 0) await batch.commit();
  console.log(`✓ Updated: ${updated}`);
  console.log(`  Skipped: ${skipped} (already had letters field)\n`);
  console.log('HR can now issue letters via the Letters tab in each employee drawer.\n');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
