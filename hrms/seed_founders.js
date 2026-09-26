/**
 * Seed founder records (DIR-001 Sankalp, DIR-002 Manisha) and link Admin logins.
 *
 * Idempotent — safe to re-run. Will:
 *   - Create or update employees/DIR-001 and employees/DIR-002 with minimal records
 *   - Add Manisha to seasoulcosmetics.com whitelist NOTE: whitelist is in index.html;
 *     this script only handles DB. Manisha must use the app's normal Sign Up flow.
 *   - If Sankalp's hrms_users doc exists (it does) → set eid + docId = DIR-001
 *   - If Manisha's Auth account exists → set/promote her hrms_users doc to Admin + DIR-002
 *   - If Manisha hasn't signed up yet → record will be there waiting for her
 *
 * Usage:
 *   node seed_founders.js --dry-run    # preview, no writes
 *   node seed_founders.js              # commit
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) { console.error('✗ serviceAccountKey.json not found'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const auth = admin.auth();

const FOUNDERS = [
  {
    docId: 'DIR-001',
    eid: 'DIR-001',
    name: 'Sankalp Chopra',
    firstName: 'Sankalp', lastName: 'Chopra',
    role: 'Co-Founder & Managing Director',  // designation
    entity: 'APHL',
    vertical: 'Office of the Director',
    grade: 'DIR',
    status: 'Active',
    workEmail: 'sankalp.chopra@aeliusparallel.com',
    reportingTo: 'Board',
    isFounder: true,
    doj: '2018-01-01',  // placeholder; edit in tool
    createdAt: new Date().toISOString().slice(0,10),
    updatedAt: new Date().toISOString().slice(0,10)
  },
  {
    docId: 'DIR-002',
    eid: 'DIR-002',
    name: 'Manisha Chopra',
    firstName: 'Manisha', lastName: 'Chopra',
    role: 'Co-Founder & Director',
    entity: 'Veridian',
    vertical: 'Office of the Director',
    grade: 'DIR',
    status: 'Active',
    workEmail: 'manisha.chopra@seasoulcosmetics.com',
    reportingTo: 'Board',
    isFounder: true,
    doj: '2018-01-01',
    createdAt: new Date().toISOString().slice(0,10),
    updatedAt: new Date().toISOString().slice(0,10)
  }
];

async function findAuthUserByEmail(email) {
  try { return await auth.getUserByEmail(email); } catch { return null; }
}

async function run() {
  console.log(`\n┌──────────────────────────────────────────┐`);
  console.log(`│  HRMS · Founder Seeder ${DRY?'(DRY RUN)':'(COMMIT) '}            │`);
  console.log(`└──────────────────────────────────────────┘\n`);

  for (const f of FOUNDERS) {
    const existing = await db.collection('employees').doc(f.docId).get();
    if (existing.exists) {
      console.log(`  • ${f.docId} ${f.name} — record already exists, ${DRY?'would merge':'merging'} fields`);
    } else {
      console.log(`  • ${f.docId} ${f.name} — ${DRY?'would CREATE':'CREATING'} new record`);
    }
    if (!DRY) {
      await db.collection('employees').doc(f.docId).set(f, { merge: true });
    }
  }

  console.log('\n  Now checking Auth + hrms_users links…\n');

  for (const f of FOUNDERS) {
    const u = await findAuthUserByEmail(f.workEmail);
    if (!u) {
      console.log(`  • ${f.workEmail}: no Auth account yet — ${f.firstName} must sign up via the app first.`);
      continue;
    }
    const huDoc = await db.collection('hrms_users').doc(u.uid).get();
    const target = { email: f.workEmail.toLowerCase(), role: 'Admin', eid: f.eid, docId: f.docId };
    if (huDoc.exists) {
      const cur = huDoc.data();
      const needsChange = cur.role !== 'Admin' || cur.eid !== f.eid || cur.docId !== f.docId;
      console.log(`  • ${f.workEmail}: hrms_users doc exists (role=${cur.role||'-'}, eid=${cur.eid||'-'}, docId=${cur.docId||'-'}). ${needsChange ? (DRY?'WOULD UPDATE to Admin+link.':'updating to Admin+link.') : 'already correct.'}`);
      if (!DRY && needsChange) {
        await db.collection('hrms_users').doc(u.uid).set(Object.assign(target, { updatedAt: new Date().toISOString() }), { merge: true });
      }
    } else {
      console.log(`  • ${f.workEmail}: Auth account exists but NO hrms_users doc. ${DRY?'WOULD CREATE':'creating'} Admin+link doc.`);
      if (!DRY) {
        await db.collection('hrms_users').doc(u.uid).set(Object.assign(target, { createdAt: new Date().toISOString().slice(0,10) }));
      }
    }
  }

  console.log(`\n  ${DRY ? 'Dry run complete — no changes written.' : '✓ Done.'}\n`);
  if (DRY) console.log('  Re-run without --dry-run to commit.\n');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
