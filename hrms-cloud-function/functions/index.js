/**
 * Aelius HRMS → AIM + Dhananjaya Bridge
 *
 * Accepts Firebase ID tokens from two projects:
 *   - aphl-pms-dashboard (AIM)
 *   - aeliusparallel-bms (Dhananjaya)
 */

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

initializeApp();
const db = getFirestore();

// Both projects whose tokens we accept
const ALLOWED_PROJECTS = [
  "aphl-pms-dashboard",
  "aeliusparallel-bms",
];

let cachedKeys = null;
let cachedKeysExpiry = 0;

async function getGooglePublicKeys() {
  const now = Date.now();
  if (cachedKeys && now < cachedKeysExpiry) return cachedKeys;
  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  cachedKeys = await res.json();
  cachedKeysExpiry = now + 60 * 60 * 1000;
  return cachedKeys;
}

/**
 * Try verifying the token against each allowed project.
 * Returns decoded payload on first success, throws if all fail.
 */
async function verifyToken(idToken) {
  const jwt = require("jsonwebtoken");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const header = JSON.parse(Buffer.from(parts[0], "base64").toString());
  const keys = await getGooglePublicKeys();
  const publicKey = keys[header.kid];
  if (!publicKey) throw new Error("Unknown key id");

  let lastError;
  for (const projectId of ALLOWED_PROJECTS) {
    try {
      const decoded = await new Promise((resolve, reject) => {
        jwt.verify(
          idToken,
          publicKey,
          {
            algorithms: ["RS256"],
            audience: projectId,
            issuer: `https://securetoken.google.com/${projectId}`,
          },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
      });
      return { decoded, projectId };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

exports.getEmployees = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) return res.status(401).json({ error: "Missing Authorization header" });

      let decoded, projectId;
      try {
        ({ decoded, projectId } = await verifyToken(idToken));
      } catch (e) {
        return res.status(401).json({ error: "Invalid token: " + e.message });
      }

      const includeInactive = req.query.includeInactive === "1";
      const snap = await db.collection("employees").get();

      const employees = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (!includeInactive && (d.status || "Active") !== "Active") return;
        employees.push({
          id: doc.id,
          eid: d.eid || "",
          name: d.name || "",
          entity: d.entity || "",
          vertical: d.vertical || "",
          role: d.role || "",
          workEmail: d.workEmail || "",
          mobile: d.mobile || "",
          location: d.location || "",
          reportingTo: d.reportingTo || "",
          doj: d.doj || "",
          status: d.status || "Active",
        });
      });

      employees.sort((a, b) => (a.eid || "").localeCompare(b.eid || ""));

      res.set("Cache-Control", "private, max-age=60");
      return res.status(200).json({
        ok: true,
        count: employees.length,
        callerUid: decoded.user_id || decoded.uid,
        callerEmail: decoded.email || "",
        callerProject: projectId,
        fetchedAt: new Date().toISOString(),
        employees,
      });
    } catch (err) {
      console.error("getEmployees failed:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);
