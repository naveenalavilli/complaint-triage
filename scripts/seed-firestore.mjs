import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const projectId = 'complaint-triage-demo-2026';
const require = createRequire(import.meta.url);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const auth = require(`${globalRoot}/firebase-tools/lib/auth.js`);

const cases = [
  {
    id: 'sample-001',
    caseNumber: 'TC-2026-000123',
    requesterName: 'Jordan Lee',
    requesterEmail: 'jordan.lee@example.test',
    requesterPhone: '555-0101',
    teacherName: 'Morgan Reed',
    school: 'Bluebonnet Middle School',
    district: 'Lone Star ISD',
    incidentDate: '2026-11-10',
    description:
      'My child says the teacher changed several test grades after a parent raised concerns. The online gradebook no longer matches the returned papers.',
    attachmentNames: ['gradebook-screenshot.png', 'returned-test.pdf'],
    status: 'ReadyForReview',
    riskLevel: 'Medium',
    retrievalScore: 0.87,
    allegationCategories: ['Assessment integrity', 'Student records'],
    missingFields: [],
    triageSummary:
      'The complaint alleges that official assessment records may have been changed after a family raised a concern. The reviewer should compare the source documents and district audit trail.',
    suggestedCodes: [
      {
        section: 'DEMO §21.310',
        title: 'Assessment integrity and records',
        reason: 'The allegation concerns a mismatch between returned work and official grades.',
        sourceChunkId: 'demo-310',
        sourceText:
          'Educators must preserve the integrity of grades, assessments, attendance, and other official student records.',
        score: 0.91,
      },
    ],
    recommendedTeam: 'Academic Compliance',
    retrievalMethod: 'Sample retrieval result',
    createdAt: '2026-11-14T15:30:00.000Z',
    updatedAt: '2026-11-14T15:44:00.000Z',
    auditCount: 7,
    lastAuditId: 'seed',
  },
  {
    id: 'sample-002',
    caseNumber: 'TC-2026-000124',
    requesterName: 'Avery Patel',
    requesterEmail: 'avery.patel@example.test',
    teacherName: 'Taylor Brooks',
    school: 'Cedar Grove Elementary',
    district: 'Lone Star ISD',
    incidentDate: '2026-11-12',
    description:
      'A classroom spreadsheet with student names, reading levels, and accommodation notes was emailed to the full volunteer list instead of the intended specialist.',
    attachmentNames: ['forwarded-email.png'],
    status: 'Escalated',
    riskLevel: 'High',
    retrievalScore: 0.94,
    allegationCategories: ['Student privacy', 'Unauthorized disclosure'],
    missingFields: [],
    triageSummary:
      'The submission describes a possible unauthorized disclosure of identifiable student information. Preserve the original email and confirm the recipient list before contacting the district.',
    suggestedCodes: [
      {
        section: 'DEMO §21.520',
        title: 'Confidentiality of student information',
        reason: 'The attachment may contain identifiable academic and accommodation information.',
        sourceChunkId: 'demo-520',
        sourceText:
          'Personally identifiable student information must be disclosed only for an authorized educational purpose.',
        score: 0.96,
      },
    ],
    recommendedTeam: 'Privacy and Records',
    retrievalMethod: 'Sample retrieval result',
    assignedTeam: 'Privacy and Records',
    createdAt: '2026-11-14T13:10:00.000Z',
    updatedAt: '2026-11-14T13:18:00.000Z',
    auditCount: 5,
    lastAuditId: 'seed',
  },
  {
    id: 'sample-003',
    caseNumber: 'TC-2026-000125',
    requesterName: 'Casey Nguyen',
    requesterEmail: 'casey.nguyen@example.test',
    teacherName: '',
    school: 'Prairie View High School',
    district: 'North Valley ISD',
    incidentDate: '',
    description:
      'The family has asked twice for a meeting about classroom communication and has not received a response. The teacher name and exact incident date were not included.',
    attachmentNames: [],
    status: 'NeedsInfo',
    riskLevel: 'Low',
    retrievalScore: 0.78,
    allegationCategories: ['Family communication'],
    missingFields: ['teacherName', 'incidentDate'],
    triageSummary:
      'The complaint concerns delayed family communication. The teacher name and incident date are needed before assignment.',
    suggestedCodes: [
      {
        section: 'DEMO §21.412',
        title: 'Communication with families',
        reason: 'The requester reports repeated unanswered attempts to arrange a meeting.',
        sourceChunkId: 'demo-412',
        sourceText:
          'Schools should provide timely, respectful, and accessible communication to families.',
        score: 0.84,
      },
    ],
    recommendedTeam: 'District Support',
    retrievalMethod: 'Sample retrieval result',
    createdAt: '2026-11-14T11:25:00.000Z',
    updatedAt: '2026-11-14T11:29:00.000Z',
    auditCount: 3,
    lastAuditId: 'seed',
  },
];

function field(value, key = '') {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => field(item)) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object') return { mapValue: { fields: fields(value) } };
  if ((key === 'createdAt' || key === 'updatedAt') && !Number.isNaN(Date.parse(String(value))))
    return { timestampValue: value };
  return { stringValue: String(value) };
}

function fields(value) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, field(item, key)]),
  );
}

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Run firebase login before seeding.');
const token = await auth.getAccessToken(account.tokens.refresh_token, []);
const base = `projects/${projectId}/databases/(default)/documents`;
const writes = [];

for (const item of cases) {
  const { id, ...data } = item;
  writes.push({
    update: { name: `${base}/cases/${id}`, fields: fields({ ...data, createdBy: 'system-seed' }) },
  });
  writes.push({
    update: {
      name: `${base}/cases/${id}/audit/seed`,
      fields: fields({
        event: 'DemoCaseSeeded',
        actor: 'system',
        actorUid: 'system-seed',
        detail: 'Fictional sample data loaded for product demonstration.',
        createdAt: item.createdAt,
      }),
    },
  });
}

const response = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  },
);

if (!response.ok)
  throw new Error(`Firestore seed failed: ${response.status} ${await response.text()}`);
console.log(`Seeded ${cases.length} fictional cases and their initial audit events.`);
