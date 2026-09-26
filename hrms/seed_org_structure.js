/**
 * Org Structure seeder.
 * Reads AeliusParallel_Org_Structure_Template (Reporting Lines sheet) and updates
 * each employee's: vertical (verticalId + verticalName), reportingTo (name),
 * reportingToEid (resolved), dotted-line where present.
 *
 * - Resolves "Reports To" names to EIDs from the roster + known founders + alias fixes
 * - Stores BOTH name and EID so the org chart can link records later
 * - Skips employees not present in Firestore (logs them)
 * - Idempotent
 *
 * Usage:
 *   node seed_org_structure.js --dry-run   (preview, no writes)
 *   node seed_org_structure.js             (commit)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DRY = process.argv.includes('--dry-run');
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) { console.error('✗ serviceAccountKey.json not found'); process.exit(1); }

const XLSX_PATH = path.join(__dirname, 'AeliusParallel_Org_Structure_Template_v1_filled.xlsx');
if (!fs.existsSync(XLSX_PATH)) {
  console.error(`✗ Place the filled template here: ${XLSX_PATH}`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const norm = n => (n||'').toString().toLowerCase().replace(/\ufeff/g,'').split(/\s+/).filter(Boolean).join(' ');

// Founders / external CA not in employee roster (update EIDs once founders are added)
const KNOWN = {
  'sankalp chopra':'APHL0001', 'sankalp':'APHL0001',
  'manisha chopra':'APHL0002', 'manisha':'APHL0002',
  'jatin gupta':'EXT-CA'
};
// Spelling-mismatch aliases: reports-to-name (normalized) -> roster name (normalized)
const ALIAS = {
  'vipin ps':'vipins p s',
  'kamal kant':'kamal kant gautam'
};

function readRows() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets['Reporting Lines'];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
  // header is row index 3 (0-based), data starts row index 4
  const rows = [];
  for (let i = 4; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[0]) continue;
    rows.push({
      eid: String(r[0]).trim(),
      name: String(r[1]||'').trim(),
      entity: String(r[2]||'').trim(),
      verticalId: String(r[4]||'').trim(),
      verticalName: String(r[5]||'').trim(),
      reportsToName: String(r[6]||'').trim(),
      dottedName: String(r[8]||'').trim()
    });
  }
  return rows;
}

async function run() {
  console.log(`\n┌──────────────────────────────────────────┐`);
  console.log(`│  HRMS · Org Structure Seeder ${DRY?'(DRY RUN)':'(COMMIT) '}    │`);
  console.log(`└──────────────────────────────────────────┘\n`);

  const rows = readRows();

  // Build name->eid from roster
  const nameToEid = {};
  rows.forEach(r => { nameToEid[norm(r.name)] = r.eid; });

  function resolve(name) {
    const rn = norm(name);
    if (!rn || ['na','tba','board','-'].includes(rn)) return '';
    if (nameToEid[rn]) return nameToEid[rn];
    if (KNOWN[rn]) return KNOWN[rn];
    if (ALIAS[rn] && nameToEid[ALIAS[rn]]) return nameToEid[ALIAS[rn]];
    return '';
  }

  // Pull existing employees
  const snap = await db.collection('employees').get();
  const byKey = {};
  snap.forEach(d => { byKey[d.id] = d.data(); });

  let updated=0, missing=[], unresolvedRpt=[];
  const batches=[db.batch()]; let bc=0;

  for (const r of rows) {
    // find the firestore doc — eid for employees, candidateId for candidates
    let docId = r.eid;
    if (!byKey[docId]) {
      // try candidate docs (keyed by candidateId) by matching name
      const candId = Object.keys(byKey).find(k => norm(byKey[k].name) === norm(r.name));
      if (candId) docId = candId; else { missing.push(`${r.eid} ${r.name}`); continue; }
    }

    const rptEid = resolve(r.reportsToName);
    if (r.reportsToName && !rptEid) unresolvedRpt.push(`${r.eid} → "${r.reportsToName}"`);

    const update = {
      vertical: r.verticalName || byKey[docId].vertical || '',
      verticalId: r.verticalId || '',
      reportingTo: r.reportsToName || byKey[docId].reportingTo || '',
      reportingToEid: rptEid || '',
      dottedLineManager: r.dottedName || ''
    };

    if (DRY) {
      if (updated < 12) console.log(`  ${docId}: vert=${update.verticalId}, rptTo=${update.reportingTo} [${rptEid||'—'}]`);
    } else {
      batches[batches.length-1].update(db.collection('employees').doc(docId), update);
      bc++; if (bc>=400){ batches.push(db.batch()); bc=0; }
    }
    updated++;
  }

  if (!DRY) { for (const b of batches) await b.commit(); }

  console.log(`\n  ${DRY?'Would update':'Updated'}: ${updated} employees`);
  if (missing.length) {
    console.log(`\n  ⚠ Not found in HRMS (${missing.length}) — add these records first:`);
    missing.forEach(m => console.log(`     ${m}`));
  }
  if (unresolvedRpt.length) {
    console.log(`\n  ⚠ Reports-to unresolved (${unresolvedRpt.length}) — name stored, EID blank:`);
    unresolvedRpt.forEach(u => console.log(`     ${u}`));
  }
  console.log(DRY ? `\n  Dry run only — no changes written. Re-run without --dry-run to commit.\n`
                  : `\n  ✓ Done.\n`);
}

run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
