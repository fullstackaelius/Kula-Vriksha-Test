/**
 * One-time update — adds empty compensation stub to all 123 existing employees.
 * Run after the initial seed. Idempotent: skips docs that already have compensation.
 *
 * Run: node update_compensation.js
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

const EMPTY_COMP = { type: "OnRoll", onRoll: {}, contract: {} };

async function run() {
  console.log('\nAdding empty compensation stub to all employee records...\n');
  const snap = await db.collection('employees').get();
  let updated = 0, skipped = 0;
  const batch = db.batch();

  snap.forEach(d => {
    const data = d.data();
    if (data.compensation && (data.compensation.onRoll || data.compensation.contract)) {
      skipped++;
    } else {
      batch.update(d.ref, { compensation: EMPTY_COMP });
      updated++;
    }
  });

  if (updated > 0) {
    await batch.commit();
  }

  console.log(`✓ Updated: ${updated}`);
  console.log(`  Skipped: ${skipped} (already had compensation)`);
  console.log('');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
