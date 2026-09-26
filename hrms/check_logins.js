/**
 * Show Firebase Auth login activity for all HRMS users.
 * Each user record has:
 *   - creationTime — when they signed up
 *   - lastSignInTime — when they last signed in (this is the meaningful one)
 *
 * Note: Firebase Auth doesn't store a full login history per user. Only
 *   the LAST login timestamp. So this script can tell us:
 *     - Who has EVER signed in
 *     - Who has NEVER signed in (creation == last sign-in OR no last sign-in)
 *     - When each person last logged in
 *
 * Usage:
 *   node check_logins.js                    # all users, sorted by most recent login
 *   node check_logins.js --never            # only users who have never signed in
 *   node check_logins.js --days 7           # only users active in last N days
 *   node check_logins.js --dormant 30       # only users INACTIVE for N+ days
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) { console.error('✗ serviceAccountKey.json not found'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const auth = admin.auth();

// Parse args
const args = process.argv.slice(2);
const NEVER_ONLY = args.includes('--never');
const ACTIVE_DAYS = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : null;
const DORMANT_DAYS = args.includes('--dormant') ? Number(args[args.indexOf('--dormant') + 1]) : null;

function daysAgo(ts) {
  if (!ts) return Infinity;
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
}
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function fmt(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

(async () => {
  console.log(`\n┌──────────────────────────────────────────────────────────┐`);
  console.log(`│  HRMS · Login Activity Report                            │`);
  console.log(`└──────────────────────────────────────────────────────────┘\n`);

  // List all Auth users (paginated for safety)
  const users = [];
  let nextPageToken;
  do {
    const result = await auth.listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  // Build summary
  const rows = users.map(u => {
    const created = u.metadata.creationTime;
    const lastSignIn = u.metadata.lastSignInTime;
    // Firebase reports creationTime == lastSignInTime when user has ONLY signed up (never signed in again)
    // But for email/password, lastSignInTime IS set on signup. So we use a heuristic: if they match within 60s, treat as "never signed in beyond signup".
    const c = new Date(created).getTime();
    const l = lastSignIn ? new Date(lastSignIn).getTime() : 0;
    const neverBeyondSignup = l && Math.abs(l - c) < 60000;
    return {
      email: u.email || '(no email)',
      uid: u.uid,
      created, lastSignIn,
      daysSinceLastSignIn: daysAgo(lastSignIn),
      neverBeyondSignup
    };
  });

  // Filter
  let filtered = rows;
  if (NEVER_ONLY) {
    filtered = rows.filter(r => !r.lastSignIn || r.neverBeyondSignup);
  } else if (ACTIVE_DAYS != null) {
    filtered = rows.filter(r => r.lastSignIn && r.daysSinceLastSignIn <= ACTIVE_DAYS);
  } else if (DORMANT_DAYS != null) {
    filtered = rows.filter(r => r.lastSignIn && r.daysSinceLastSignIn >= DORMANT_DAYS && !r.neverBeyondSignup);
  }

  // Sort by most recent sign-in first (or never-signed at top if filtering for those)
  if (NEVER_ONLY) {
    filtered.sort((a, b) => a.email.localeCompare(b.email));
  } else {
    filtered.sort((a, b) => (new Date(b.lastSignIn || 0)) - (new Date(a.lastSignIn || 0)));
  }

  // Summary counts
  const totalAuth = rows.length;
  const everSignedIn = rows.filter(r => r.lastSignIn && !r.neverBeyondSignup).length;
  const onlySignedUp = rows.filter(r => r.neverBeyondSignup).length;
  const noSignIn = rows.filter(r => !r.lastSignIn).length;
  const last7d = rows.filter(r => r.lastSignIn && r.daysSinceLastSignIn <= 7 && !r.neverBeyondSignup).length;
  const last30d = rows.filter(r => r.lastSignIn && r.daysSinceLastSignIn <= 30 && !r.neverBeyondSignup).length;

  console.log(`  Total Firebase Auth users:           ${totalAuth}`);
  console.log(`  Have signed in (beyond signup):      ${everSignedIn}`);
  console.log(`  Only ever signed up (never returned):${onlySignedUp}`);
  console.log(`  No sign-in record at all:            ${noSignIn}`);
  console.log(`  Active in last 7 days:               ${last7d}`);
  console.log(`  Active in last 30 days:              ${last30d}`);
  console.log('');

  // Print filtered table
  if (filtered.length === 0) {
    console.log(`  No users match the current filter.\n`);
    process.exit(0);
  }
  const filterLabel = NEVER_ONLY ? '(never signed in beyond signup)'
    : ACTIVE_DAYS != null ? `(active in last ${ACTIVE_DAYS} days)`
    : DORMANT_DAYS != null ? `(dormant ${DORMANT_DAYS}+ days)`
    : '(all)';
  console.log(`  ── Showing ${filtered.length} users ${filterLabel} ──\n`);
  console.log(`  ${pad('Email', 48)} ${pad('Last Sign-In', 18)} ${pad('Days Ago', 9)} ${pad('Created', 18)}`);
  console.log(`  ${'-'.repeat(48)} ${'-'.repeat(18)} ${'-'.repeat(9)} ${'-'.repeat(18)}`);
  for (const r of filtered) {
    const lastStr = r.neverBeyondSignup ? '(signup only)' : fmt(r.lastSignIn);
    const daysStr = !r.lastSignIn ? '—' : r.neverBeyondSignup ? '—' : String(r.daysSinceLastSignIn);
    console.log(`  ${pad(r.email, 48)} ${pad(lastStr, 18)} ${pad(daysStr, 9)} ${pad(fmt(r.created), 18)}`);
  }
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
