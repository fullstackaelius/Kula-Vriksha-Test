// Diagnostic — print the exact field shape of Anurag's record so we can compare
// to what buildAiContext is mapping.
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json'))) });
const db = admin.firestore();

(async () => {
  console.log("\n=== Anurag Kumar (APHL0003) raw Firestore data ===\n");
  const snap = await db.collection('employees').doc('APHL0003').get();
  if (!snap.exists) { console.log("Record not found at employees/APHL0003"); process.exit(0); }
  const data = snap.data();
  // Print every top-level field. Show the value for primitives, "{...}"/"[...]" for compounds.
  for (const [k, v] of Object.entries(data)) {
    if (v == null) console.log(`  ${k}: (null/undefined)`);
    else if (typeof v === 'object') console.log(`  ${k}: ${Array.isArray(v) ? '[array, ' + v.length + ']' : '{...}'} → ${JSON.stringify(v).slice(0,120)}${JSON.stringify(v).length>120?'…':''}`);
    else if (v === '') console.log(`  ${k}: (empty string)`);
    else console.log(`  ${k}: ${JSON.stringify(v)}`);
  }

  // Specifically check the fields the AI is expecting
  console.log("\n=== Fields the AI expects (and whether they exist) ===");
  const expected = ['workEmail','personalEmail','mobile','altMobile','dob','gender','maritalStatus','bloodGroup','pan','aadhaar','pfNo','uan','esicNo','bankName','bankAcc','ifsc','ctc','compensation','role','vertical','entity','status','doj','reportingTo'];
  for (const f of expected) {
    const v = data[f];
    if (v === undefined) console.log(`  ✗ ${f}: NOT IN DOCUMENT`);
    else if (v === null || v === '') console.log(`  ○ ${f}: empty value`);
    else console.log(`  ✓ ${f}: ${typeof v === 'object' ? '{populated}' : JSON.stringify(v).slice(0,60)}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
