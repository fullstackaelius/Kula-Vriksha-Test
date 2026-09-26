// seed_mom_directory.js — Populate mom_directory from employees collection.
// Reads all Active employees, writes name-only records to mom_directory.
// Safe to re-run: it will overwrite existing entries and remove any stale ones.
//
// Usage: node seed_mom_directory.js
//        node seed_mom_directory.js --dry-run   (preview only, no writes)

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

async function seed() {
  console.log("\n=== Seeding mom_directory ===");
  if (DRY_RUN) console.log("(dry-run — no writes)\n");

  // Load all employees
  const empSnap = await db.collection("employees").get();
  console.log(`Read ${empSnap.size} employees from employees collection.`);

  // Build the target directory set
  const target = new Map();  // eid -> {eid, name, entity, vertical, designation, status}
  empSnap.forEach(d => {
    const data = d.data();
    const eid = data.eid || d.id;
    if (!eid) return;
    // Only include Active employees in the directory — resigned/exited/terminated stay out
    if (data.status !== "Active") return;
    if (!data.name) return;
    target.set(eid, {
      eid,
      name: data.name,
      entity: data.entity || '',
      vertical: data.vertical || '',
      designation: data.designation || '',
      status: data.status,
      // Timestamp of last sync
      syncedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  console.log(`After filtering for Active status + name present: ${target.size} directory entries to write.`);

  // Load existing directory to detect stale entries (people who left / became inactive)
  const dirSnap = await db.collection("mom_directory").get();
  const existing = new Set();
  dirSnap.forEach(d => existing.add(d.id));
  console.log(`mom_directory currently has ${existing.size} entries.`);

  const toWrite = [];
  const toDelete = [];
  for (const [eid, rec] of target) toWrite.push({ eid, rec });
  for (const eid of existing) if (!target.has(eid)) toDelete.push(eid);

  console.log(`\nPlan: write ${toWrite.length}, delete ${toDelete.length} stale.`);

  if (DRY_RUN) {
    console.log("\nSample of writes (first 5):");
    toWrite.slice(0, 5).forEach(({ eid, rec }) => console.log(`  ${eid}: ${rec.name} · ${rec.entity} · ${rec.designation}`));
    if (toDelete.length > 0) {
      console.log("\nSample of stale to delete (first 5):");
      toDelete.slice(0, 5).forEach(eid => console.log(`  ${eid}`));
    }
    console.log("\nDry-run complete. No writes made.\n");
    process.exit(0);
  }

  // Batch writes (500 per batch limit)
  let batch = db.batch();
  let batchCount = 0;
  let totalWrites = 0;
  for (const { eid, rec } of toWrite) {
    batch.set(db.collection("mom_directory").doc(eid), rec);
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      totalWrites += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }
  for (const eid of toDelete) {
    batch.delete(db.collection("mom_directory").doc(eid));
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      totalWrites += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) {
    await batch.commit();
    totalWrites += batchCount;
  }
  console.log(`\nDone. ${totalWrites} operations completed.`);
  console.log(`mom_directory now reflects ${target.size} active employees.\n`);
  process.exit(0);
}

seed().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
