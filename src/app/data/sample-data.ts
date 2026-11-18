import { ComplaintCase, EducationCodeChunk } from '../models';

export const EDUCATION_CODE: EducationCodeChunk[] = [
  {
    id: 'demo-101',
    section: 'DEMO §21.101',
    title: 'Professional conduct and student welfare',
    text: 'An educator must maintain professional boundaries, protect student welfare, and report conduct that creates a credible risk of physical or emotional harm.',
    keywords: ['safety', 'harm', 'threat', 'boundary', 'student welfare', 'violence'],
    team: 'Educator Investigations',
  },
  {
    id: 'demo-205',
    section: 'DEMO §21.205',
    title: 'Fair treatment and nondiscrimination',
    text: 'Instructional and disciplinary decisions must not discriminate on protected characteristics, and retaliation for reporting a concern is prohibited.',
    keywords: ['discrimination', 'retaliation', 'bias', 'unequal', 'protected'],
    team: 'Civil Rights Review',
  },
  {
    id: 'demo-310',
    section: 'DEMO §21.310',
    title: 'Assessment integrity and records',
    text: 'Educators must preserve the integrity of grades, assessments, attendance, and other official student records and correct material errors promptly.',
    keywords: ['grade', 'assessment', 'test', 'record', 'attendance', 'altered'],
    team: 'Academic Compliance',
  },
  {
    id: 'demo-412',
    section: 'DEMO §21.412',
    title: 'Communication with families',
    text: 'Schools should provide timely, respectful, and accessible communication to families about significant academic, behavioral, or safety concerns.',
    keywords: ['parent', 'family', 'communication', 'notice', 'meeting', 'email'],
    team: 'District Support',
  },
  {
    id: 'demo-520',
    section: 'DEMO §21.520',
    title: 'Confidentiality of student information',
    text: 'Personally identifiable student information must be disclosed only for an authorized educational purpose and through approved channels.',
    keywords: ['privacy', 'confidential', 'record', 'shared', 'email', 'student information'],
    team: 'Privacy and Records',
  },
];

export const SAMPLE_CASES: ComplaintCase[] = [
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
    confidence: 0.87,
    allegationCategories: ['Assessment integrity', 'Student records'],
    missingFields: [],
    aiSummary:
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
    createdAt: '2026-11-14T15:30:00.000Z',
    updatedAt: '2026-11-14T15:44:00.000Z',
    auditCount: 7,
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
    confidence: 0.94,
    allegationCategories: ['Student privacy', 'Unauthorized disclosure'],
    missingFields: [],
    aiSummary:
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
    assignedTeam: 'Privacy and Records',
    createdAt: '2026-11-14T13:10:00.000Z',
    updatedAt: '2026-11-14T13:18:00.000Z',
    auditCount: 5,
  },
  {
    id: 'sample-003',
    caseNumber: 'TC-2026-000125',
    requesterName: 'Casey Nguyen',
    requesterEmail: 'casey.nguyen@example.test',
    school: 'Prairie View High School',
    district: 'North Valley ISD',
    description:
      'The family has asked twice for a meeting about classroom communication and has not received a response. The teacher name and exact incident date were not included.',
    attachmentNames: [],
    status: 'NeedsInfo',
    riskLevel: 'Low',
    confidence: 0.78,
    allegationCategories: ['Family communication'],
    missingFields: ['teacherName', 'incidentDate'],
    aiSummary:
      'The complaint concerns delayed family communication. The teacher name and incident date are needed before routing.',
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
    createdAt: '2026-11-14T11:25:00.000Z',
    updatedAt: '2026-11-14T11:29:00.000Z',
    auditCount: 3,
  },
];
