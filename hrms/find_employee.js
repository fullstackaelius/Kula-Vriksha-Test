const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function find(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) { console.error("Usage: node find_employee.js <name fragment>"); process.exit(1); }

  console.log("\n=== Searching for employees matching:", q, "===\n");

  const snap = await db.collection("employees").get();
  const matches = [];
  snap.forEach(d => {
    const data = d.data();
    const name = (data.name || '').toLowerCase();
    if (name.includes(q)) {
      matches.push({ docId: d.id, ...data });
    }
  });

  if (matches.length === 0) {
    console.log("No employees found whose name contains '" + q + "'.");
    process.exit(0);
  }

  console.log("Found " + matches.length + " match(es):\n");
  matches.forEach((e, i) => {
    console.log("--- Match #" + (i+1) + " ---");
    console.log("  Doc ID:           " + e.docId);
    console.log("  Name:             " + e.name);
    console.log("  EID:              " + (e.eid || e.docId));
    console.log("  Status:           " + (e.status || '(empty)'));
    console.log("  Entity:           " + (e.entity || '(empty)'));
    console.log("  --- email-like fields ---");
    console.log("  workEmail:        '" + (e.workEmail || '(empty)') + "'");
    console.log("  officialEmail:    '" + (e.officialEmail || '(empty)') + "'");
    console.log("  personalEmail:    '" + (e.personalEmail || '(empty)') + "'");
    console.log("  email:            '" + (e.email || '(empty)') + "'");
    console.log("");
  });
  process.exit(0);
}

const arg = process.argv[2];
if (!arg) { console.error("Usage: node find_employee.js <name fragment>"); process.exit(1); }
find(arg).catch(err => { console.error("FATAL:", err); process.exit(1); });
