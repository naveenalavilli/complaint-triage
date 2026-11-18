# Complaint Triage

A working, fictional demonstration of requester-authenticated public complaint intake and
human-centered, retrieval-and-rules review. The system helps the public submit and track their
own cases while staff identify missing information, retrieve relevant policy text, inspect cited
recommendations, and record the human decision.

Created by [Naveen Alavilli](https://github.com/naveenalavilli).

**Live demo:** <https://complaint-triage-demo-2026.web.app>

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system context, component and
deployment diagrams, runtime flows, data model, trust boundaries, failure behavior,
verification strategy, and production evolution path.

## Demo capabilities

- Firebase email/password authentication with Requester, Reviewer, and Supervisor profiles
- Separate `Requester` registration/sign-in for public intake
- Requester-only “My submissions” view; staff-only review, audit, and disposition controls
- Structured complaint intake and case-number generation
- Image OCR in the browser with Tesseract.js
- Free, in-browser semantic retrieval with `Xenova/all-MiniLM-L6-v2`
- Deterministic keyword fallback if the model is unavailable
- Transparent deterministic rules for risk, categories, completeness, synopsis, and team
- Grounded policy citations with validation-friendly source IDs
- Human actions: approve, send back, or escalate
- Atomic Firestore case/audit writes with authenticated actor validation

All people, complaints, districts, schools, and policy sections in the demo are fictional.
The policy corpus is labelled `DEMO` and is not legal advice. This app does **not** call a
generative LLM. MiniLM produces embeddings only; inspectable application rules produce the
risk label, categories, missing-field list, synopsis, and team suggestion. Staff make every
decision.

## What is sent to the model—and what comes back

1. The browser combines the complaint description with locally extracted OCR text and truncates
   that string to 4,000 characters.
2. Browser-local `Xenova/all-MiniLM-L6-v2` converts that text into a normalized numeric embedding.
   Complaint text is not sent to a hosted inference API.
3. The same model embeds the five bundled fictional policy sections once per page session; those
   vectors are cached in memory and reused.
4. Cosine-equivalent dot products rank the policy sections. The displayed **retrieval score** is
   the top similarity value—not a generated confidence score.
5. Deterministic regular-expression and completeness rules derive risk, categories, missing
   fields, the synopsis template, and recommended team. Citation IDs and source text are copied
   directly from the ranked bundled corpus.

There is no prompt, generated completion, or model-returned JSON to validate. The saved result is
checked structurally by TypeScript types, restricted Firestore field updates, source-backed
citation objects, and a required human decision. If MiniLM cannot load, the app labels and uses a
deterministic keyword-overlap fallback.

> **Security notice:** this deployment is an authenticated fictional-data demo. The role gates
> staff writes but is not a production-grade assignment or tenant control, and the
> current Firestore rules allow staff broad case access. Requesters can create and read only cases
> owned by their Firebase UID and cannot read audit events or perform workflow actions. Do not
> enter real complaint, student, or confidential information.

## Public intake and staff review

- **Requester:** creates a public-intake account, submits a fictional complaint, and sees only
  submissions created by that account. The email field is bound to the authenticated email.
- **Reviewer:** sees the staff queue, runs policy retrieval and transparent rules, and can send
  cases back or escalate them.
- **Supervisor:** performs the same staff workflow and can approve the recommendation and team
  assignment.

The public intake is intentionally separate from the internal review surface. Firestore queries
and security rules enforce the requester ownership filter; hiding staff controls in the UI is not
the security boundary. A production public portal should additionally require verified email,
App Check/bot protection, abuse throttling, consent/retention notices, and a trusted server for
workflow mutations.

## Interface and affiliation

The interface uses [TEA's published brand guidance](https://tea.texas.gov/about-tea/newsroom/media/branding-standards)
as a visual reference: Open Sans, TEA blue/orange, navy, sky blue, light blue, and a restrained
government-system information hierarchy. It does not use the TEA logo and is not affiliated with
or endorsed by the Texas Education Agency.

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
administrator can run `node scripts/provision-demo-users.mjs`. It provisions Requester, Reviewer,
and Supervisor demo profiles and saves generated passwords outside the repository in
`~/.config/complaint-triage/demo-accounts.json` with owner-only file permissions.
Rerunning does not reset existing passwords.

`node scripts/verify-live.mjs` uses the project's `playwright-core` dependency and discovers
Chrome/Chromium on Linux, macOS, or Windows; set `CHROME_BIN` for another location. It verifies
all three roles, proves requester isolation, creates a fictional complaint through public intake,
runs browser-side retrieval as Reviewer, approves it as Supervisor, and checks persisted audit
events. Each run adds one fictional verification case; the three original sample cases are
unchanged.

The demo roles do not implement production assignment-scoped approval enforcement. This
Firebase/browser demo does not implement email delivery, external routing, or persistent
attachment storage. Public intake requires a Requester account so each person can see only their
own submissions; production must add email verification, bot protection, abuse throttling,
privacy/retention consent, and accessible account recovery before accepting real complaints.
