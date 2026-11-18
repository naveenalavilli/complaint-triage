export type UserRole = 'Requester' | 'Reviewer' | 'Supervisor' | 'Legal' | 'Admin';
export type CaseStatus = 'Received' | 'NeedsInfo' | 'ReadyForReview' | 'Approved' | 'Escalated';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Unscored';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface CodeSuggestion {
  section: string;
  title: string;
  reason: string;
  sourceChunkId: string;
  sourceText: string;
  score: number;
}

export interface ComplaintCase {
  id: string;
  caseNumber: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  teacherName?: string;
  school?: string;
  district?: string;
  incidentDate?: string;
  description: string;
  extractedText?: string;
  attachmentNames: string[];
  status: CaseStatus;
  riskLevel: RiskLevel;
  retrievalScore: number;
  allegationCategories: string[];
  missingFields: string[];
  triageSummary?: string;
  suggestedCodes: CodeSuggestion[];
  recommendedTeam?: string;
  retrievalMethod?: string;
  assignedTeam?: string;
  reviewerNotes?: string;
  createdAt: string;
  updatedAt: string;
  auditCount: number;
}

export interface EducationCodeChunk {
  id: string;
  section: string;
  title: string;
  text: string;
  keywords: string[];
  team: string;
}

export interface TriageResult {
  riskLevel: Exclude<RiskLevel, 'Unscored'>;
  retrievalScore: number;
  allegationCategories: string[];
  missingFields: string[];
  triageSummary: string;
  suggestedCodes: CodeSuggestion[];
  recommendedTeam: string;
  retrievalMethod: string;
}
