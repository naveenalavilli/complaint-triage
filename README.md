# Complaint Triage

A working, fictional demonstration of structured complaint intake and human-centered,
AI-assisted review. The system helps staff identify missing information, retrieve relevant
policy text, draft cited recommendations, and record the human decision.

Created by [Naveen Alavilli](https://github.com/naveenalavilli).

**Live demo:** <https://complaint-triage-demo-2026.web.app>

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system context, component and
deployment diagrams, runtime flows, data model, trust boundaries, failure behavior,
verification strategy, and production evolution path.

## Demo capabilities

- Firebase email/password authentication with reviewer profiles
- Structured complaint intake and case-number generation
- Image OCR in the browser with Tesseract.js
- Free, in-browser semantic retrieval with `Xenova/all-MiniLM-L6-v2`
- Deterministic keyword fallback if the model is unavailable
- Grounded policy citations with validation-friendly source IDs
- Human actions: approve, send back, or escalate
- Firestore case records and append-only audit events

All people, complaints, districts, schools, and policy sections in the demo are fictional.
The policy corpus is labelled `DEMO` and is not legal advice. AI output is always a draft;
the reviewer makes the decision.

> **Security notice:** this deployment is an authenticated fictional-data demo. The role
> labels are not production authorization controls, and the current Firestore rules allow
> authenticated demo users broad case access. Do not enter real complaint, student, or
> confidential information.

## Local development

```bash
npm install
npm start
```

Open `http://localhost:4200` and sign in with a provisioned Firebase demo account.

## Verification and deployment

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
firebase deploy --only firestore,hosting
```

Firebase Hosting serves `dist/complaint-triage/browser` as a single-page application.

## Demo accounts and live verification

After enabling Email/Password in Firebase Authentication, an authenticated Firebase CLI
administrator can run `node scripts/provision-demo-users.mjs`. It provisions Reviewer and
Supervisor demo profiles and saves generated passwords outside the repository in
`~/.config/complaint-triage/demo-accounts.json` with owner-only file permissions.
Rerunning does not reset existing passwords.

On the workspace host, `node scripts/verify-live.mjs` uses Chromium and the installed
OpenClaw Playwright runtime to verify both accounts, create a fictional complaint,
run browser-side retrieval, approve it, and verify persisted audit events. Each run
adds one fictional verification case; the three original sample cases are unchanged.

The role labels are demo profiles, not production role-based approval enforcement.
This Firebase/browser demo does not implement the full .NET worker architecture,
email delivery, external routing, or persistent attachment storage.
