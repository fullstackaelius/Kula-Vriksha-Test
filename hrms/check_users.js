const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();
(async () => {
  // List all Auth users
  const authUsers = [];
  let token;
  do {
    const res = await auth.listUsers(1000, token);
    res.users.forEach(u => authUsers.push({ uid: u.uid, email: u.email }));
    token = res.pageToken;
  } while (token);

  // List all hrms_users docs
  const hu = await db.collection('hrms_users').get();
  const huByUid = {};
  hu.forEach(d => huByUid[d.id] = d.data());

  console.log(`\n=== Auth users: ${authUsers.length} | hrms_users docs: ${hu.size} ===\n`);
  console.log("Each Auth user and whether they have an hrms_users role doc:\n");
  authUsers.forEach(u => {
    const doc = huByUid[u.uid];
    if (doc) {
      console.log(`  ✓ ${u.email}  → role=${doc.role}, eid=${doc.eid||'(none)'}, docId=${doc.docId||'(none)'}`);
    } else {
      console.log(`  ✗ ${u.email}  → NO hrms_users doc (ORPHAN — this is why login fails)`);
    }
  });
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
