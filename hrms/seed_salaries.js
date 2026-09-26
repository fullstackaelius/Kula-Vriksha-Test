/**
 * Seed compensation data from seed_compensation.json into Firestore.
 *
 * Reads seed_compensation.json (mapping EID → compensation object)
 * Updates each employee record with the compensation block + sets ctc field.
 *
 * Safe to re-run: overwrites compensation each time.
 *
 * Run modes:
 *   node seed_salaries.js              → seed all
 *   node seed_salaries.js --dry-run    → preview only, no writes
 *   node seed_salaries.js --force      → overwrite even if employee already has filled compensation
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('✗ serviceAccountKey.json not found');
  process.exit(1);
}

const seedPath = path.join(__dirname, 'seed_compensation.json');
if (!fs.existsSync(seedPath)) {
  console.error('✗ seed_compensation.json not found');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const COMP_BY_EID = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

async function run() {
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  HRMS · Compensation Seed               │');
  console.log('└─────────────────────────────────────────┘\n');
  console.log(`Records in seed file: ${Object.keys(COMP_BY_EID).length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : FORCE ? 'FORCE OVERWRITE' : 'NORMAL (skip already-filled)'}`);
  console.log('');

  let written = 0, skipped = 0, missing = 0;
  const batches = [db.batch()];
  let batchCount = 0;

  for (const [eid, comp] of Object.entries(COMP_BY_EID)) {
    const ref = db.collection('employees').doc(eid);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ✗ Missing employee: ${eid}`);
      missing++;
      continue;
    }

    const data = snap.data();
    const hasFilled = data.compensation && data.compensation.onRoll
      && (data.compensation.onRoll.basic_m > 0 || data.compensation.onRoll.takeHomeMonthly > 0);

    if (hasFilled && !FORCE) {
      skipped++;
      continue;
    }

    // Annual CTC = takeHomeMonthly × 12 (matches their existing pattern)
    const annualCTC = comp.onRoll.takeHomeAnnual || 0;

    if (DRY_RUN) {
      console.log(`  [dry] ${eid.padEnd(10)} ${(data.name||'').padEnd(28)} M:₹${comp.onRoll.takeHomeMonthly.toLocaleString('en-IN').padStart(8)}  A:₹${annualCTC.toLocaleString('en-IN').padStart(10)}`);
      written++;
      continue;
    }

    const currentBatch = batches[batches.length - 1];
    currentBatch.update(ref, {
      compensation: comp,
      ctc: annualCTC,                // also update top-level CTC for stat-strip rollups
      ctcCurrency: data.ctcCurrency || 'INR',
      updatedAt: new Date().toISOString().slice(0,10)
    });
    batchCount++;
    written++;

    if (batchCount >= 400) {
      batches.push(db.batch());
      batchCount = 0;
    }
  }

  if (!DRY_RUN) {
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`  ✓ Batch ${i+1}/${batches.length} committed`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`  Written:  ${written}`);
  console.log(`  Skipped:  ${skipped} (already had compensation, use --force to overwrite)`);
  console.log(`  Missing:  ${missing} (EID not in HRMS)`);
  console.log('─────────────────────────────────────────\n');

  if (DRY_RUN) {
    console.log('  Dry run complete. No data was written.');
    console.log('  Run without --dry-run to seed for real.\n');
  } else {
    console.log('  HR can now see filled Compensation tab for these employees.');
    console.log('  Letter generator will also auto-fill salary tables in Appointment Letters.\n');
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
