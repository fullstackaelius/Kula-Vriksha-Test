# Aelius HRMS → AIM Bridge — Deployment Guide

This deploys a Cloud Function in your HRMS Firebase project (`aeliusparallel-bms`) that AIM will call to read employee data. Total time: about 25 minutes.

---

## Before you start

You'll need:

- A laptop with internet
- Your Google account that owns `aeliusparallel-bms`
- About 25 minutes of focused time

You'll be using **Terminal** (Mac) or **Command Prompt / PowerShell** (Windows). Don't worry if you've never used it — every command you need is written out below. Just copy and paste each line and press Enter.

---

## Step 1 — Install Node.js (skip if already installed)

Open Terminal/Command Prompt and run:

```
node --version
```

- If you see something like `v18.x.x` or `v20.x.x` → you have Node, **skip to Step 2**
- If you see `command not found` → install Node 20 from https://nodejs.org/ (pick the LTS version, run the installer, click Next through everything)

After installation, **close and reopen Terminal**, then run `node --version` again to confirm.

---

## Step 2 — Install Firebase CLI

In Terminal, run:

```
npm install -g firebase-tools
```

This downloads the Firebase command-line tools globally. Takes 1–2 minutes. You may see warnings — those are fine, only errors matter.

Verify it worked:

```
firebase --version
```

You should see a version number like `13.x.x`.

---

## Step 3 — Log in to Firebase

```
firebase login
```

This opens your browser. Pick the Google account that owns `aeliusparallel-bms`. Click Allow. Come back to Terminal — you should see "Success! Logged in as your.email@gmail.com".

---

## Step 4 — Move the function files into place

Unzip the `hrms-cloud-function` folder I sent you and put it somewhere you'll remember (Desktop is fine).

In Terminal, navigate INTO that folder:

```
cd ~/Desktop/hrms-cloud-function
```

(Replace `~/Desktop/` with wherever you put the folder. On Windows, use `cd C:\Users\YourName\Desktop\hrms-cloud-function`.)

Verify you're in the right place:

```
ls
```

You should see `firebase.json`, `.firebaserc`, and a `functions/` folder.

---

## Step 5 — Install function dependencies

```
cd functions
npm install
cd ..
```

This downloads the Firebase SDK and JWT library into the `functions/node_modules` folder. Takes 1–2 minutes. Ignore deprecation warnings.

---

## Step 6 — Verify project target

```
firebase use
```

You should see `Active Project: default (aeliusparallel-bms)`.

If you see something else, run:

```
firebase use aeliusparallel-bms
```

---

## Step 7 — Deploy

```
firebase deploy --only functions
```

This uploads your function to Firebase. Takes 2–5 minutes the first time.

**First-time-only prompts you may see:**

- "Enable Cloud Functions API" → **type Y, press Enter**
- "Enable Cloud Build API" → **type Y, press Enter**
- "Enable Artifact Registry API" → **type Y, press Enter**
- "Required to set up billing" → if you see this, your project is on Spark (free) plan and needs Blaze. You said you're already on Blaze so this shouldn't appear, but if it does, follow the link to enable Blaze and re-run the deploy.

When it finishes, you'll see something like:

```
✔  functions[getEmployees(us-central1)] Successful create operation.
Function URL (getEmployees(us-central1)): https://getemployees-xxxxxxx-uc.a.run.app
```

**Copy that Function URL — you'll paste it into AIM in the next phase.**

---

## Step 8 — Quick test

In Terminal, run (replace YOUR_URL with the URL from Step 7):

```
curl YOUR_URL
```

You should get back:

```
{"error":"Missing Authorization header"}
```

**That's correct.** The function is live and refusing unauthenticated calls. Good.

---

## You're done with the HRMS side

Now share the Function URL with me (paste it in the next message) and I'll update AIM to use it. The rest is just HTML changes — no more Terminal.

---

## If you get stuck

Common issues:

- **"firebase: command not found"** → npm didn't install globally. On Mac, try `sudo npm install -g firebase-tools`. On Windows, run Command Prompt as Administrator.
- **"Permission denied"** → on Mac, prepend `sudo` to the command.
- **"Billing not enabled"** → go to Firebase Console → aeliusparallel-bms → ⚙ → Usage and billing → switch to Blaze plan.
- **Deploy hangs at "uploading"** → kill it (Ctrl+C), check your internet, re-run.

Paste any error you hit and I'll guide you through it.
