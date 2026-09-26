const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();

const VALID = e => e.endsWith('@seasoulcosmetics.com') || e.endsWith('@aeliusparallel.com');

(async () => {
  // auth users without hrms_users doc
  const authUsers = [];
  let token;
  do { const r = await auth.listUsers(1000, token); r.users.forEach(u=>authUsers.push({uid:u.uid,email:(u.email||'').toLowerCase()})); token=r.pageToken; } while(token);
  const hu = await db.collection('hrms_users').get();
  const hasDoc = new Set(hu.docs.map(d=>d.id));
  const orphans = authUsers.filter(u => !hasDoc.has(u.uid) && VALID(u.email));

  // employee workEmail -> record
  const emp = await db.collection('employees').get();
  const byEmail = {};
  emp.forEach(d => { const w=(d.data().workEmail||'').toLowerCase().trim(); if(w) byEmail[w]={id:d.id, ...d.data()}; });

  console.log(`\n=== ${orphans.length} valid-domain orphans — match against employee workEmail ===\n`);
  const fixable=[], nomatch=[];
  orphans.forEach(o => {
    const m = byEmail[o.email];
    if (m) { fixable.push({...o, eid:m.eid||m.id, docId:m.id, name:m.name, status:m.status}); 
      console.log(`  ✓ MATCH   ${o.email}  → ${m.name} (${m.eid||m.id}, ${m.status})`); }
    else { nomatch.push(o); console.log(`  ✗ NOMATCH ${o.email}  → no employee record with this workEmail`); }
  });
  console.log(`\nFixable (match an employee): ${fixable.length}`);
  console.log(`No matching employee record: ${nomatch.length}`);
  require('fs').writeFileSync(path.join(__dirname,'orphan_report.json'), JSON.stringify({fixable,nomatch},null,2));
  console.log(`\nWrote orphan_report.json`);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
