import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const projectId = 'complaint-triage-demo-2026';
const require = createRequire(import.meta.url);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const auth = require(`${globalRoot}/firebase-tools/lib/auth.js`);
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Run firebase login first.');
const token = await auth.getAccessToken(account.tokens.refresh_token, []);
const headers = {
  Authorization: `Bearer ${token.access_token}`,
  'Content-Type': 'application/json',
};
const directory = `${homedir()}/.config/complaint-triage`;
const credentialPath = `${directory}/demo-accounts.json`;
await mkdir(directory, { recursive: true, mode: 0o700 });
let saved = [];
try {
  saved = JSON.parse(await readFile(credentialPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function request(url, body, method = 'POST') {
  const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${response.status}: ${result.error?.message ?? 'Request failed'}`);
  return result;
}

for (const role of ['Requester', 'Reviewer', 'Supervisor']) {
  const email = `${role.toLowerCase()}@complaint-triage.example`;
  let credentials = saved.find((item) => item.email === email);
  const existing = await request(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    { email: [email] },
  );
  let uid = existing.users?.[0]?.localId;
  if (!uid) {
    credentials ??= { email, password: `Ct!${randomBytes(18).toString('base64url')}`, role };
    if (!saved.includes(credentials)) saved.push(credentials);
    await writeFile(credentialPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
    const created = await request('https://identitytoolkit.googleapis.com/v1/accounts:signUp', {
      targetProjectId: projectId,
      email,
      password: credentials.password,
      displayName: `Demo ${role}`,
      emailVerified: false,
    });
    uid = created.localId;
  }
  if (!credentials)
    throw new Error(
      `Account ${email} already exists without locally saved credentials; no password was changed.`,
    );
  credentials.uid = uid;
  await writeFile(credentialPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
  await request(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
    {
      fields: {
        email: { stringValue: email },
        displayName: { stringValue: `Demo ${role}` },
        role: { stringValue: role },
      },
    },
    'PATCH',
  );
  console.log(`Provisioned ${role}: ${email}`);
}
console.log(`Credentials saved outside the repository: ${credentialPath}`);
