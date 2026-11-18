export type UserRole = 'Reviewer' | 'Supervisor' | 'Legal' | 'Admin';
export type CaseStatus =
  | 'Received'
  | 'Processing'
  | 'NeedsInfo'
  | 'ReadyForReview'
  | 'Approved'
  | 'Routed'
  | 'Escalated';
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
  confidence: number;
  allegationCategories: string[];
  missingFields: string[];
  aiSummary?: string;
  suggestedCodes: CodeSuggestion[];
  recommendedTeam?: string;
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
  confidence: number;
  allegationCategories: string[];
  missingFields: string[];
  aiSummary: string;
  suggestedCodes: CodeSuggestion[];
  recommendedTeam: string;
  model: string;
}
