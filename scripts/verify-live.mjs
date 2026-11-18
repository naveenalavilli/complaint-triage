import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = require(`${globalRoot}/openclaw/node_modules/playwright-core`);
const accounts = JSON.parse(await readFile(`${homedir()}/.config/complaint-triage/demo-accounts.json`, 'utf8'));
const environment = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const apiKey = environment.match(/apiKey: '([^']+)'/)[1];
const app = initializeApp({ projectId: 'complaint-triage-demo-2026', apiKey }, 'live-verification');
const auth = getAuth(app);
const database = getFirestore(app);
const browser = await chromium.launch({ executablePath: '/snap/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const requesterName = `Fictional verification ${Date.now()}`;

async function login(account) {
  await page.goto('https://complaint-triage-demo-2026.web.app');
  await page.locator('input[name=email]').fill(account.email);
  await page.locator('input[name=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Review queue', exact: true }).waitFor();
  await page.getByText('TC-2026-000123', { exact: true }).waitFor();
  assert.equal(await page.locator('.notice.warning').count(), 0);
  assert.match(await page.locator('.user-card').innerText(), new RegExp(account.role));
}

try {
  const reviewer = accounts.find((account) => account.role === 'Reviewer');
  await login(reviewer);
  await page.getByRole('button', { name: 'Add complaint', exact: false }).click();
  for (const [name, value] of Object.entries({
    requesterName,
    requesterEmail: 'fictional-check@example.test',
    teacherName: 'Fictional Test Educator',
    school: 'Fictional Demo School',
    district: 'Fictional Demo District',
    incidentDate: '2026-11-16',
    description: 'Fictional verification only: a family requested a meeting about classroom communication and did not receive a reply.',
  })) await page.locator(`form [name=${name}]`).fill(value);
  await page.getByRole('button', { name: 'Submit complaint', exact: true }).click();
  await page.locator('.case-drawer').waitFor();
  await page.getByRole('button', { name: 'Run assisted triage', exact: false }).click();
  await page.locator('.ai-summary').waitFor({ timeout: 240000 });
  assert.ok(await page.locator('.citation-card').count() > 0);
  const caseNumber = await page.locator('.case-drawer header p').innerText();
  console.log(`Intake and triage persisted: ${caseNumber}`);
  await page.getByRole('button', { name: 'Close case', exact: true }).click();
  await page.getByTitle('Sign out', { exact: true }).click();
  await page.locator('input[name=email]').waitFor();

  const supervisor = accounts.find((account) => account.role === 'Supervisor');
  await login(supervisor);
  await page.getByText(caseNumber, { exact: true }).click();
  await page.getByLabel('Reviewer notes', { exact: true }).fill('Fictional end-to-end verification: reviewed the cited demo policy and approved team assignment.');
  await page.getByRole('button', { name: 'Approve', exact: false }).click();
  await page.getByText('Recommendation approved and routed.', { exact: false }).waitFor();
  await page.locator('tbody tr').filter({ hasText: caseNumber }).locator('.status').filter({ hasText: /^Approved$/ }).waitFor();
  await page.reload();
  await page.getByText(caseNumber, { exact: true }).click();
  await page.locator('.case-badges .status').filter({ hasText: /^Approved$/ }).waitFor();
  await signInWithEmailAndPassword(auth, supervisor.email, supervisor.password);
  const matches = await getDocs(query(collection(database, 'cases'), where('requesterName', '==', requesterName)));
  assert.equal(matches.size, 1);
  const record = matches.docs[0];
  assert.equal(record.data().status, 'Approved');
  assert.ok(record.data().assignedTeam);
  const audit = await getDocs(collection(database, 'cases', record.id, 'audit'));
  assert.deepEqual(audit.docs.map((item) => item.data().event).sort(), ['AiTriageCompleted', 'Approved', 'CaseSubmitted']);
  const approval = audit.docs.find((item) => item.data().event === 'Approved');
  assert.equal(approval.data().actor, supervisor.email);
  console.log(JSON.stringify({ caseNumber, status: record.data().status, model: record.data().model, assignedTeam: record.data().assignedTeam, auditEvents: audit.size }));
  await page.screenshot({ path: '/tmp/complaint-triage-verified.png', fullPage: true });
  console.log('PASS: both logins, intake, cited triage, supervisor approval, persistence, team assignment, and audit trail.');
} finally {
  await context.close();
  await browser.close();
  await deleteApp(app);
}
