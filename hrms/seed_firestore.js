/**
 * AeliusParallel HRMS — Firestore Seeding Script
 * 
 * One-time script to load 123 employees from seed_employees.json into Firestore.
 * Run with: node seed_firestore.js
 * 
 * SETUP:
 * 1. npm install firebase-admin
 * 2. Get service account key from Firebase Console:
 *    Project Settings → Service Accounts → Generate New Private Key
 *    Save as `serviceAccountKey.json` in this folder.
 * 3. Make sure `seed_employees.json` is in this folder.
 * 4. Run: node seed_firestore.js
 * 
 * SAFETY: Script skips records that already exist (won't overwrite).
 * Pass --force to overwrite existing records.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

// ===== INIT FIREBASE ADMIN =====
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('✗ serviceAccountKey.json not found in', __dirname);
  console.error('  Download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}
const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ===== LOAD SEED =====
const seedPath = path.join(__dirname, 'seed_employees.json');
if (!fs.existsSync(seedPath)) {
  console.error('✗ seed_employees.json not found');
  process.exit(1);
}
const employees = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

// ===== RUN =====
async function seed() {
  console.log(`\n┌─────────────────────────────────────────┐`);
  console.log(`│  AeliusParallel HRMS · Firestore Seed   │`);
  console.log(`└─────────────────────────────────────────┘\n`);
  console.log(`Project:      ${serviceAccount.project_id}`);
  console.log(`Records:      ${employees.length}`);
  console.log(`Mode:         ${DRY_RUN ? 'DRY RUN' : FORCE ? 'FORCE OVERWRITE' : 'SKIP EXISTING'}`);
  console.log(``);

  let created = 0, skipped = 0, updated = 0, failed = 0;
  const batchSize = 400; // Firestore limit is 500

  for (let i = 0; i < employees.length; i += batchSize) {
    const chunk = employees.slice(i, i + batchSize);
    const batch = db.batch();

    for (const emp of chunk) {
      const ref = db.collection('employees').doc(emp.eid);

      if (!FORCE && !DRY_RUN) {
        const snap = await ref.get();
        if (snap.exists) {
          skipped++;
          continue;
        }
      }

      if (DRY_RUN) {
        console.log(`  [dry] ${emp.eid.padEnd(10)} ${emp.name.padEnd(28)} ${emp.entity.padEnd(10)} ${emp.vertical}`);
        created++;
        continue;
      }

      batch.set(ref, emp);
      if (FORCE) updated++; else created++;
    }

    if (!DRY_RUN) {
      try {
        await batch.commit();
        process.stdout.write(`  ✓ Batch ${Math.floor(i/batchSize)+1} committed (${chunk.length} ops)\n`);
      } catch (err) {
        failed += chunk.length;
        console.error(`  ✗ Batch ${Math.floor(i/batchSize)+1} failed:`, err.message);
      }
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Created:      ${created}`);
  console.log(`Updated:      ${updated}`);
  console.log(`Skipped:      ${skipped}`);
  console.log(`Failed:       ${failed}`);
  console.log(`─────────────────────────────────────────\n`);

  if (DRY_RUN) {
    console.log(`This was a dry run. No data was written.`);
    console.log(`Run without --dry-run to seed for real.\n`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
