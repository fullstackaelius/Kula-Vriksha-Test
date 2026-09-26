// check_user.js — Diagnose why a specific user can't log in to Kula Vriksha
// Usage: node check_user.js mounika.k@seasoulcosmetics.com
//
// Checks (in order):
//   1. Firebase Auth — does the email exist? when was the account created? last sign-in?
//   2. hrms_users collection — does a doc exist for their UID? what role/eid does it have?
//   3. employees collection — does an employee record exist? is officialEmail matching? status Active?
//   4. Cross-checks — does the EID in hrms_users match an actual employee doc?
//
// Output: clear PASS/FAIL per check + diagnosis + recommended fix.

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function diagnose(email) {
  email = (email || '').trim().toLowerCase();
  if (!email) {
    console.error("Usage: node check_user.js <email>");
    process.exit(1);
  }

  console.log("\n=== Login diagnostic for:", email, "===\n");

  // ─── CHECK 1: Firebase Auth ──────────────────────────────────────
  let authUser = null;
  try {
    authUser = await auth.getUserByEmail(email);
    console.log("✓ CHECK 1 — Firebase Auth:        PASS");
    console.log("  UID:              " + authUser.uid);
    console.log("  Email verified:   " + authUser.emailVerified);
    console.log("  Created:          " + authUser.metadata.creationTime);
    console.log("  Last sign-in:     " + (authUser.metadata.lastSignInTime || "NEVER"));
    console.log("  Disabled:         " + authUser.disabled);
    if (authUser.disabled) {
      console.log("  ⚠ ACCOUNT IS DISABLED in Firebase Auth — re-enable from Firebase Console.\n");
    }
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.log("✗ CHECK 1 — Firebase Auth:        FAIL");
      console.log("  No account exists in Firebase Auth for this email.");
      console.log("  → Mounika hasn't signed up yet. She needs to go to the Kula Vriksha login");
      console.log("    page and use the 'Sign Up' flow (or whatever the new-user flow is).");
      console.log("    The email she enters during sign-up MUST exactly match the officialEmail");
      console.log("    on her employee record (case-insensitive).\n");
      // Still check employees record to give complete picture
    } else {
      console.log("✗ CHECK 1 — Firebase Auth:        ERROR -", err.message);
    }
  }

  // ─── CHECK 2: hrms_users ─────────────────────────────────────────
  let hrmsUser = null;
  if (authUser) {
    try {
      const huSnap = await db.collection("hrms_users").doc(authUser.uid).get();
      if (huSnap.exists) {
        hrmsUser = huSnap.data();
        console.log("\n✓ CHECK 2 — hrms_users doc:       PASS");
        console.log("  role:             " + hrmsUser.role);
        console.log("  eid:              " + (hrmsUser.eid || "(empty)"));
        console.log("  docId:            " + (hrmsUser.docId || "(empty)"));
        console.log("  email stored:     " + (hrmsUser.email || "(empty)"));
        console.log("  name:             " + (hrmsUser.name || "(empty)"));
        if (!hrmsUser.eid && !hrmsUser.docId) {
          console.log("  ⚠ No EID or docId attached — employee record not linked. She'll be");
          console.log("    treated as a stray user with no scorecard access.");
        }
      } else {
        console.log("\n✗ CHECK 2 — hrms_users doc:       FAIL");
        console.log("  Firebase Auth has her UID, but no hrms_users doc exists.");
        console.log("  → This usually means she signed up but the sign-up flow didn't complete,");
        console.log("    OR the rule blocked her doc creation, OR her email doesn't match any");
        console.log("    employee record. The app's sign-up handler should auto-create this doc;");
        console.log("    if it didn't, there's a code issue OR her email isn't recognized.\n");
      }
    } catch (err) {
      console.log("\n✗ CHECK 2 — hrms_users doc:       ERROR -", err.message);
    }
  }

  // ─── CHECK 3: employees collection (by officialEmail match) ──────
  let employees = [];
  try {
    const empSnap = await db.collection("employees").get();
    empSnap.forEach(d => {
      const data = d.data();
      const offEmail = (data.officialEmail || "").toLowerCase().trim();
      const persEmail = (data.personalEmail || "").toLowerCase().trim();
      if (offEmail === email || persEmail === email) {
        employees.push({ docId: d.id, ...data });
      }
    });

    if (employees.length === 0) {
      console.log("\n✗ CHECK 3 — employees collection: FAIL");
      console.log("  No employee record found where officialEmail or personalEmail = " + email);
      console.log("  → This is the most likely root cause. If Mounika is a Veridian/SeaSoul");
      console.log("    employee but her record is missing from the employees collection,");
      console.log("    she has no identity to attach to. Someone needs to:");
      console.log("      a) Create her employee record in Kula Vriksha (HR action), OR");
      console.log("      b) Set her officialEmail in an existing record to match this email\n");
    } else if (employees.length === 1) {
      const emp = employees[0];
      console.log("\n✓ CHECK 3 — employees collection: PASS");
      console.log("  Doc ID:           " + emp.docId);
      console.log("  EID:              " + (emp.eid || emp.docId));
      console.log("  Name:             " + emp.name);
      console.log("  Status:           " + emp.status);
      console.log("  Entity:           " + (emp.entity || "(empty)"));
      console.log("  Vertical:         " + (emp.vertical || "(empty)"));
      console.log("  Designation:      " + (emp.designation || "(empty)"));
      console.log("  Reporting to:     " + (emp.reportingTo || "(empty)"));
      console.log("  Official Email:   " + (emp.officialEmail || "(empty)"));
      if (emp.status !== "Active") {
        console.log("  ⚠ EMPLOYEE IS NOT ACTIVE (status: " + emp.status + ") — sign-in may be blocked");
        console.log("    by access rules. Reactivate the employee record if she's currently working.");
      }
    } else {
      console.log("\n⚠ CHECK 3 — employees collection: WARNING");
      console.log("  Found " + employees.length + " employee records with this email — DUPLICATES exist.");
      console.log("  Doc IDs found: " + employees.map(e => e.docId).join(", "));
      console.log("  → This will confuse the sign-up flow. Delete or fix the duplicates so only one record matches.\n");
    }
  } catch (err) {
    console.log("\n✗ CHECK 3 — employees collection: ERROR -", err.message);
  }

  // ─── CHECK 4: Cross-check hrms_users.eid vs employees ───────────
  if (hrmsUser && (hrmsUser.eid || hrmsUser.docId)) {
    const lookup = hrmsUser.eid || hrmsUser.docId;
    try {
      const empBySnap = await db.collection("employees").doc(lookup).get();
      if (empBySnap.exists) {
        console.log("\n✓ CHECK 4 — EID linkage:          PASS");
        console.log("  hrms_users.eid (" + lookup + ") matches an actual employee doc.");
      } else {
        console.log("\n✗ CHECK 4 — EID linkage:          FAIL");
        console.log("  hrms_users says eid = " + lookup + " but NO employee doc with that ID exists.");
        console.log("  → Broken link. Fix hrms_users.eid to a real employee docId, OR create the");
        console.log("    missing employee record.\n");
      }
    } catch (err) {
      console.log("\n✗ CHECK 4 — EID linkage:          ERROR -", err.message);
    }
  }

  // ─── DIAGNOSIS ────────────────────────────────────────────────────
  console.log("\n=== DIAGNOSIS ===\n");
  if (!authUser && employees.length === 0) {
    console.log("Mounika has NEITHER a Firebase Auth account NOR an employee record.");
    console.log("FIX: First, create her employee record in Kula Vriksha (HR action — add new");
    console.log("     employee with officialEmail = " + email + " and entity = Veridian).");
    console.log("     Then ask Mounika to visit the login page and use 'Sign Up' with this email.");
  } else if (!authUser && employees.length > 0) {
    console.log("Mounika has an employee record but no Firebase Auth account.");
    console.log("FIX: Ask Mounika to go to the Kula Vriksha login page and use 'Sign Up'");
    console.log("     with email " + email + " — the sign-up should link her to her existing record.");
  } else if (authUser && !hrmsUser && employees.length === 0) {
    console.log("Mounika signed up to Firebase Auth but has neither an hrms_users doc nor an");
    console.log("employee record. Sign-up couldn't complete because no employee record matched.");
    console.log("FIX: Create her employee record first (officialEmail = " + email + "), then she");
    console.log("     can sign in again — the app should detect her and link the records.");
  } else if (authUser && !hrmsUser && employees.length > 0) {
    console.log("Mounika has a Firebase Auth account AND an employee record, but the sign-up");
    console.log("flow didn't create her hrms_users doc. Likely a Firestore rule issue or a");
    console.log("transient sign-up error.");
    console.log("FIX: Ask her to sign out, clear browser cache, and sign in again. If still");
    console.log("     broken, manually create the hrms_users doc:");
    console.log("       Collection: hrms_users");
    console.log("       Doc ID: " + authUser.uid);
    console.log("       Fields: { role: 'Employee', eid: '" + employees[0].docId + "', ");
    console.log("                docId: '" + employees[0].docId + "', email: '" + email + "', name: '" + employees[0].name + "' }");
  } else if (authUser && hrmsUser) {
    if (employees.length === 0) {
      console.log("Mounika has Auth + hrms_users but no matching employee record found by email.");
      console.log("This is weird — sign-up shouldn't have completed without an employee match.");
      console.log("FIX: Check hrms_users.eid = '" + (hrmsUser.eid || "(empty)") + "' against employees collection manually.");
    } else {
      console.log("All three records exist. Login SHOULD be working.");
      console.log("If she still can't log in:");
      console.log("  - Wrong password? Ask her to use 'Forgot Password' to reset.");
      console.log("  - Browser cached old session? Ask her to clear cache or try incognito.");
      console.log("  - Network issue? Ask her to check connectivity.");
      console.log("  - What's the EXACT error message she sees? Send a screenshot.");
    }
  }

  console.log("\n=== END DIAGNOSTIC ===\n");
  process.exit(0);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node check_user.js <email>");
  process.exit(1);
}
diagnose(arg).catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
