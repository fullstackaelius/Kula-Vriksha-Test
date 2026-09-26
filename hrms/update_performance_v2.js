/**
 * Performance Management v2 migration.
 *
 * For each existing performancePlans[] entry:
 *  - Adds `plb` block (defaults: not eligible) if missing
 *  - Adds `salesIncentive` block (defaults: not eligible) if missing
 *  - Removes legacy `incentive` block if present (replaced by plb + salesIncentive)
 *
 * Idempotent — safe to re-run.
 *
 * Run: node update_performance_v2.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('✗ serviceAccountKey.json not found');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const DEFAULT_PLB_TIER_MATRIX = [
  { scoreFrom: 90, scoreTo: 100, multiplier: 1.0,  label: "Outstanding" },
  { scoreFrom: 75, scoreTo: 89,  multiplier: 0.85, label: "Exceeds Expectations" },
  { scoreFrom: 60, scoreTo: 74,  multiplier: 0.7,  label: "Meets Expectations" },
  { scoreFrom: 40, scoreTo: 59,  multiplier: 0.4,  label: "Below Expectations" },
  { scoreFrom: 0,  scoreTo: 39,  multiplier: 0,    label: "Unsatisfactory" }
];

const DEFAULT_PLB = {
  eligible: false,
  maxPercentOfCTC: 10,
  companyWeight: 0.5,
  individualWeight: 0.5,
  calcApproach: "A",
  tiers: DEFAULT_PLB_TIER_MATRIX
};

const DEFAULT_SALES_INCENTIVE = {
  eligible: false,
  calcMethod: "slab_percent",
  frequency: "monthly",
  capture: "monthly",
  targetMetric: "Revenue",
  annualTarget: 0,
  maxIncentive: 0,
  slabs: [
    { fromPct: 100, toPct: 110, rate: 5  },
    { fromPct: 110, toPct: 125, rate: 7.5 },
    { fromPct: 125, toPct: 999, rate: 10 }
  ],
  monthly: [
    { period: "Apr", actual: 0 }, { period: "May", actual: 0 }, { period: "Jun", actual: 0 },
    { period: "Jul", actual: 0 }, { period: "Aug", actual: 0 }, { period: "Sep", actual: 0 },
    { period: "Oct", actual: 0 }, { period: "Nov", actual: 0 }, { period: "Dec", actual: 0 },
    { period: "Jan", actual: 0 }, { period: "Feb", actual: 0 }, { period: "Mar", actual: 0 }
  ],
  ytdActual: 0
};

async function run() {
  console.log('\nMigrating performance plans to v2 schema (PLB + Sales Incentive)...\n');
  const snap = await db.collection('employees').get();
  let plansMigrated = 0, employeesTouched = 0, skipped = 0;
  const batches = [db.batch()];
  let batchCount = 0;

  snap.forEach(d => {
    const data = d.data();
    const plans = data.performancePlans || [];
    if (plans.length === 0) { skipped++; return; }

    let touched = false;
    const newPlans = plans.map(p => {
      const np = { ...p };
      let changed = false;
      if (!np.plb) { np.plb = JSON.parse(JSON.stringify(DEFAULT_PLB)); changed = true; }
      if (!np.salesIncentive) { np.salesIncentive = JSON.parse(JSON.stringify(DEFAULT_SALES_INCENTIVE)); changed = true; }
      if (np.incentive) { delete np.incentive; changed = true; }
      if (changed) { touched = true; plansMigrated++; }
      return np;
    });

    if (touched) {
      const cur = batches[batches.length - 1];
      cur.update(d.ref, { performancePlans: newPlans });
      batchCount++;
      employeesTouched++;
      if (batchCount >= 400) { batches.push(db.batch()); batchCount = 0; }
    }
  });

  for (let i = 0; i < batches.length; i++) await batches[i].commit();

  console.log(`  Plans migrated:     ${plansMigrated}`);
  console.log(`  Employees updated:  ${employeesTouched}`);
  console.log(`  Skipped (no plans): ${skipped}\n`);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
