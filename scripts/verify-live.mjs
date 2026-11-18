import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const accounts = JSON.parse(
  await readFile(`${homedir()}/.config/complaint-triage/demo-accounts.json`, 'utf8'),
);
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
const session = { idToken: '', appCheckToken: '', localId: '' };
const firestoreBase =
  'https://firestore.googleapis.com/v1/projects/complaint-triage-demo-2026/databases/(default)/documents';

page.on('response', async (response) => {
  try {
    const url = response.url();
    if (
      process.env['DEBUG_TOKENS'] &&
      (url.includes('identitytoolkit.googleapis.com') ||
        url.includes('firebaseappcheck.googleapis.com'))
    ) {
      console.log(`Token endpoint ${response.status()}: ${new URL(url).pathname}`);
    }
    if (
      url.includes('identitytoolkit.googleapis.com') &&
      url.includes('accounts:signInWithPassword')
    ) {
      const data = await response.json();
      session.idToken = data.idToken ?? '';
      session.localId = data.localId ?? '';
    }
    if (
      url.includes('firebaseappcheck.googleapis.com') &&
      url.includes('exchangeRecaptchaEnterpriseToken')
    ) {
      const data = await response.json();
      session.appCheckToken = data.token ?? '';
      if (process.env['DEBUG_TOKENS'] && !data.token) {
        console.log(`App Check exchange error: ${data.error?.message ?? 'unknown error'}`);
      }
    }
  } catch {
    // Ignore non-JSON responses; only the two token endpoints above matter here.
  }
});

async function waitForSessionTokens() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (session.idToken && session.localId && session.appCheckToken) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for browser Authentication and App Check tokens.');
}

async function firestoreRequest(path, init = {}) {
  await waitForSessionTokens();
  return fetch(`${firestoreBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'X-Firebase-AppCheck': session.appCheckToken,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function queryCases(field, value) {
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'cases' }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: value },
        },
      },
    },
  };
  const response = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify(query),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.flatMap((item) => (item.document ? [item.document] : []));
}

function stringField(document, name) {
  return document.fields?.[name]?.stringValue ?? '';
}

async function login(account) {
  session.idToken = '';
  session.localId = '';
  await page.goto('https://complaint-triage-demo-2026.web.app');
  assert.match(
    await page.locator('body').innerText(),
    /Not affiliated with or endorsed by the Texas Education Agency/i,
  );
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
  await waitForSessionTokens();
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
  const ownCases = await queryCases('createdBy', session.localId);
  const unattestedCases = await fetch(`${firestoreBase}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'cases' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'createdBy' },
            op: 'EQUAL',
            value: { stringValue: session.localId },
          },
        },
      },
    }),
  });
  assert.ok(
    [401, 403].includes(unattestedCases.status),
    'Firestore must reject an authenticated request without App Check attestation.',
  );
  const requesterRecord = ownCases.find(
    (item) => stringField(item, 'requesterName') === requesterName,
  );
  assert.ok(requesterRecord, 'The Requester must be able to read the case they created.');
  assert.equal(stringField(requesterRecord, 'requesterEmail'), requester.email);
  const requesterRecordId = requesterRecord.name.split('/').pop();
  const allCases = await firestoreRequest('/cases');
  assert.equal(allCases.status, 403, 'A Requester must not be able to list every case.');
  const requesterAudit = await firestoreRequest(`/cases/${requesterRecordId}/audit`);
  assert.equal(requesterAudit.status, 403, 'A Requester must not be able to read audit events.');
  await page.getByRole('button', { name: 'Close case', exact: true }).click();
  await page.getByTitle('Sign out', { exact: true }).click();
  await page.locator('input[name=email]').waitFor();

  const reviewer = accounts.find((account) => account.role === 'Reviewer');
  await login(reviewer);
  await page.getByText(caseNumber, { exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Approve', exact: false }).count(),
    0,
    'A Reviewer must not see the approval action.',
  );
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
  const matches = await queryCases('requesterName', requesterName);
  assert.equal(matches.length, 1);
  const record = matches[0];
  assert.equal(stringField(record, 'status'), 'Approved');
  assert.ok(stringField(record, 'assignedTeam'));
  const recordId = record.name.split('/').pop();
  const auditResponse = await firestoreRequest(`/cases/${recordId}/audit`);
  const audit = await auditResponse.json();
  assert.equal(auditResponse.status, 200, JSON.stringify(audit));
  const auditDocuments = audit.documents ?? [];
  assert.deepEqual(auditDocuments.map((item) => stringField(item, 'event')).sort(), [
    'Approved',
    'CaseSubmitted',
    'PolicyTriageCompleted',
  ]);
  const approval = auditDocuments.find((item) => stringField(item, 'event') === 'Approved');
  assert.equal(stringField(approval, 'actor'), supervisor.email);
  console.log(
    JSON.stringify({
      caseNumber,
      status: stringField(record, 'status'),
      retrievalMethod: stringField(record, 'retrievalMethod'),
      assignedTeam: stringField(record, 'assignedTeam'),
      auditEvents: auditDocuments.length,
    }),
  );
  await page.screenshot({ path: '/tmp/complaint-triage-verified.png', fullPage: true });
  console.log(
    'PASS: requester isolation, public intake, reviewer triage, supervisor approval, persistence, team assignment, and linked audit trail.',
  );
} finally {
  await context.close();
  await browser.close();
}
