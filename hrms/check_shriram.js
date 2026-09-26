const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();

(async () => {
  // 1. Look up Shriram's Auth account
  const authUser = await auth.getUserByEmail('shriram.mukul@aeliusparallel.com').catch(()=>null);
  console.log(`\n=== Shriram's AUTH account ===`);
  if (!authUser) { console.log("  NOT FOUND in Firebase Auth"); process.exit(0); }
  console.log(`  uid: ${authUser.uid}`);
  console.log(`  email: ${authUser.email}`);
  console.log(`  emailVerified: ${authUser.emailVerified}`);
  console.log(`  disabled: ${authUser.disabled}`);
  console.log(`  metadata.lastSignIn: ${authUser.metadata.lastSignInTime}`);
  console.log(`  metadata.creation: ${authUser.metadata.creationTime}`);

  // 2. Look up hrms_users by THIS uid (what the app does)
  console.log(`\n=== hrms_users/${authUser.uid} (lookup by current uid) ===`);
  const huByUid = await db.collection('hrms_users').doc(authUser.uid).get();
  if (huByUid.exists) {
    console.log("  EXISTS:", JSON.stringify(huByUid.data(), null, 2));
  } else {
    console.log("  ✗ DOES NOT EXIST under uid =", authUser.uid);
  }

  // 3. Find ALL hrms_users docs with this email — to see if there's an orphaned doc under a different uid
  console.log(`\n=== Search hrms_users by email ===`);
  const all = await db.collection('hrms_users').get();
  const matches = [];
  all.forEach(d => {
    const v = d.data();
    if ((v.email||'').toLowerCase() === 'shriram.mukul@aeliusparallel.com') {
      matches.push({ docId: d.id, ...v });
    }
  });
  if (matches.length === 0) console.log("  No hrms_users docs match this email.");
  else matches.forEach(m => console.log(`  docId=${m.docId} role=${m.role} eid=${m.eid} stored_docId=${m.docId}\n     UID match? ${m.docId === authUser.uid ? 'YES' : 'NO — different UID!'}`));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
