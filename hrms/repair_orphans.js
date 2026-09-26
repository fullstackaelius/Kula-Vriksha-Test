/**
 * Repair orphan auth accounts.
 *
 * SAFE (default): creates missing hrms_users role docs for orphans whose email
 *   matches an Active employee's workEmail. They can then log in immediately.
 *
 * DESTRUCTIVE (only with --delete-nomatch): deletes auth accounts that have a
 *   valid HRMS domain but match NO employee record (the mgr.* / departmental aliases).
 *   @veridianbrands.com accounts are NEVER touched (BMS).
 *
 * Usage:
 *   node repair_orphans.js               -> fix the 3 matchable, just LIST the no-match
 *   node repair_orphans.js --delete-nomatch  -> also delete the stray no-match auth accounts
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();

const DELETE_NOMATCH = process.argv.includes('--delete-nomatch');
const VALID = e => e.endsWith('@seasoulcosmetics.com') || e.endsWith('@aeliusparallel.com');

(async () => {
  // gather auth users + existing hrms_users
  const authUsers = [];
  let token;
  do { const r = await auth.listUsers(1000, token); r.users.forEach(u=>authUsers.push({uid:u.uid,email:(u.email||'').toLowerCase()})); token=r.pageToken; } while(token);
  const hu = await db.collection('hrms_users').get();
  const hasDoc = new Set(hu.docs.map(d=>d.id));

  // employee workEmail -> record
  const emp = await db.collection('employees').get();
  const byEmail = {};
  emp.forEach(d => { const w=(d.data().workEmail||'').toLowerCase().trim(); if(w) byEmail[w]={id:d.id, ...d.data()}; });

  const orphans = authUsers.filter(u => !hasDoc.has(u.uid) && VALID(u.email));

  let fixed=0; const noMatch=[];
  for (const o of orphans) {
    const m = byEmail[o.email];
    if (m && m.status === 'Active') {
      await db.collection('hrms_users').doc(o.uid).set({
        email: o.email,
        role: 'Employee',
        eid: m.eid || m.id,
        docId: m.id,
        createdAt: new Date().toISOString().slice(0,10),
        repairedAt: new Date().toISOString()
      });
      console.log(`  ✓ FIXED  ${o.email}  → ${m.name} (${m.eid||m.id})`);
      fixed++;
    } else {
      noMatch.push(o);
    }
  }

  console.log(`\n  Fixed (role doc created): ${fixed}`);
  console.log(`  No matching employee: ${noMatch.length}`);
  noMatch.forEach(o => console.log(`     ${o.email}`));

  if (noMatch.length) {
    if (DELETE_NOMATCH) {
      console.log(`\n  Deleting ${noMatch.length} stray auth accounts...`);
      for (const o of noMatch) {
        try { await auth.deleteUser(o.uid); console.log(`     ✗ deleted ${o.email}`); }
        catch(e){ console.log(`     ! failed ${o.email}: ${e.message}`); }
      }
    } else {
      console.log(`\n  (To delete these stray accounts, re-run with --delete-nomatch)`);
    }
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
