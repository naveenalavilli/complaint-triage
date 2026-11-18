import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';

const accounts = JSON.parse(
  await readFile(`${homedir()}/.config/complaint-triage/demo-accounts.json`, 'utf8'),
);
const environment = await readFile(
  new URL('../src/environments/environment.ts', import.meta.url),
  'utf8',
);
const apiKey = environment.match(/apiKey: '([^']+)'/)[1];
const app = initializeApp({ projectId: 'complaint-triage-demo-2026', apiKey }, 'live-verification');
const auth = getAuth(app);
const database = getFirestore(app);
const executablePath = [
  process.env['CHROME_BIN'],
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((candidate) => candidate && existsSync(candidate));
if (!executablePath)
  throw new Error('Chrome/Chromium not found. Set CHROME_BIN to its executable path.');
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const requesterName = `Fictional verification ${Date.now()}`;

async function login(account) {
  await page.goto('https://complaint-triage-demo-2026.web.app');
  if (account.role === 'Requester') {
    await page.getByRole('button', { name: 'Public intake', exact: true }).click();
  }
  await page.locator('input[name=email]').fill(account.email);
  await page.locator('input[name=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  await page
    .getByRole('heading', {
      name: account.role === 'Requester' ? 'Submit a complaint' : 'Review queue',
      exact: true,
    })
    .waitFor();
  if (account.role !== 'Requester') {
    await page.getByText('TC-2026-000123', { exact: true }).waitFor();
  }
  assert.equal(await page.locator('.notice.warning').count(), 0);
  assert.match(await page.locator('.user-card').innerText(), new RegExp(account.role));
}

try {
  const requester = accounts.find((account) => account.role === 'Requester');
  await login(requester);
  assert.equal(await page.getByRole('button', { name: 'Audit overview' }).count(), 0);
  for (const [name, value] of Object.entries({
    requesterName,
    requesterEmail: requester.email,
    teacherName: 'Fictional Test Educator',
    school: 'Fictional Demo School',
    district: 'Fictional Demo District',
    incidentDate: '2026-11-16',
    description:
      'Fictional verification only: a family requested a meeting about classroom communication and did not receive a reply.',
  }))
    await page.locator(`form [name=${name}]`).fill(value);
  await page.getByRole('button', { name: 'Submit complaint', exact: true }).click();
  await page.locator('.case-drawer').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Run transparent triage' }).count(), 0);
  const caseNumber = await page.locator('.case-drawer header p').innerText();
  console.log(`Requester intake persisted: ${caseNumber}`);
  const requesterCredential = await signInWithEmailAndPassword(
    auth,
    requester.email,
    requester.password,
  );
  const ownCases = await getDocs(
    query(collection(database, 'cases'), where('createdBy', '==', requesterCredential.user.uid)),
  );
  const requesterRecord = ownCases.docs.find((item) => item.data().requesterName === requesterName);
  assert.ok(requesterRecord, 'The Requester must be able to read the case they created.');
  assert.equal(requesterRecord.data().requesterEmail, requester.email);
  await assert.rejects(
    getDocs(collection(database, 'cases')),
    /permission-denied|Missing or insufficient permissions/i,
  );
  await assert.rejects(
    getDocs(collection(database, 'cases', requesterRecord.id, 'audit')),
    /permission-denied|Missing or insufficient permissions/i,
  );
  await page.getByRole('button', { name: 'Close case', exact: true }).click();
  await page.getByTitle('Sign out', { exact: true }).click();
  await page.locator('input[name=email]').waitFor();

  const reviewer = accounts.find((account) => account.role === 'Reviewer');
  await login(reviewer);
  await page.getByText(caseNumber, { exact: true }).click();
  await page.getByRole('button', { name: 'Run transparent triage', exact: false }).click();
  await page.locator('.ai-summary').waitFor({ timeout: 240000 });
  assert.ok((await page.locator('.citation-card').count()) > 0);
  console.log(`Staff triage persisted: ${caseNumber}`);
  await page.getByRole('button', { name: 'Close case', exact: true }).click();
  await page.getByTitle('Sign out', { exact: true }).click();
  await page.locator('input[name=email]').waitFor();

  const supervisor = accounts.find((account) => account.role === 'Supervisor');
  await login(supervisor);
  await page.getByText(caseNumber, { exact: true }).click();
  await page
    .getByLabel('Reviewer notes', { exact: true })
    .fill(
      'Fictional end-to-end verification: reviewed the cited demo policy and approved team assignment.',
    );
  await page.getByRole('button', { name: 'Approve', exact: false }).click();
  await page
    .getByText('Recommendation approved; the team assignment was saved.', { exact: false })
    .waitFor();
  await page
    .locator('tbody tr')
    .filter({ hasText: caseNumber })
    .locator('.status')
    .filter({ hasText: /^Approved$/ })
    .waitFor();
  await page.reload();
  await page.getByText(caseNumber, { exact: true }).click();
  await page
    .locator('.case-badges .status')
    .filter({ hasText: /^Approved$/ })
    .waitFor();
  await signInWithEmailAndPassword(auth, supervisor.email, supervisor.password);
  const matches = await getDocs(
    query(collection(database, 'cases'), where('requesterName', '==', requesterName)),
  );
  assert.equal(matches.size, 1);
  const record = matches.docs[0];
  assert.equal(record.data().status, 'Approved');
  assert.ok(record.data().assignedTeam);
  const audit = await getDocs(collection(database, 'cases', record.id, 'audit'));
  assert.deepEqual(audit.docs.map((item) => item.data().event).sort(), [
    'Approved',
    'CaseSubmitted',
    'PolicyTriageCompleted',
  ]);
  const approval = audit.docs.find((item) => item.data().event === 'Approved');
  assert.equal(approval.data().actor, supervisor.email);
  console.log(
    JSON.stringify({
      caseNumber,
      status: record.data().status,
      retrievalMethod: record.data().retrievalMethod,
      assignedTeam: record.data().assignedTeam,
      auditEvents: audit.size,
    }),
  );
  await page.screenshot({ path: '/tmp/complaint-triage-verified.png', fullPage: true });
  console.log(
    'PASS: requester isolation, public intake, reviewer triage, supervisor approval, persistence, team assignment, and linked audit trail.',
  );
} finally {
  await context.close();
  await browser.close();
  await deleteApp(app);
}
