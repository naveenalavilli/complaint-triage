import { Injectable, signal } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { ComplaintCase, TriageResult, UserProfile } from '../models';
import { SAMPLE_CASES } from '../data/sample-data';

type ReviewAction = 'approve' | 'sendBack' | 'escalate';

@Injectable({ providedIn: 'root' })
export class CaseService {
  readonly cases = signal<ComplaintCase[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private unsubscribe?: () => void;

  start(profile: UserProfile): void {
    this.unsubscribe?.();
    this.loading.set(true);
    const caseQuery =
      profile.role === 'Requester'
        ? query(collection(firestore, 'cases'), where('createdBy', '==', profile.uid))
        : query(collection(firestore, 'cases'), orderBy('createdAt', 'desc'));
    this.unsubscribe = onSnapshot(
      caseQuery,
      (snapshot) => {
        const cases = snapshot.docs
          .map((item) => this.mapCase(item))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        this.cases.set(cases.length || profile.role === 'Requester' ? cases : SAMPLE_CASES);
        this.loading.set(false);
        this.error.set('');
      },
      () => {
        this.cases.set(profile.role === 'Requester' ? [] : SAMPLE_CASES);
        this.loading.set(false);
        this.error.set('Live data is unavailable; showing fictional demo cases.');
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.cases.set([]);
  }

  async createCase(input: Partial<ComplaintCase>, actor: UserProfile): Promise<string> {
    const now = new Date();
    const caseRef = doc(collection(firestore, 'cases'));
    const auditRef = doc(collection(caseRef, 'audit'));
    const caseNumber = `TC-${now.getFullYear()}-${caseRef.id.slice(0, 8).toUpperCase()}`;
    const payload = {
      caseNumber,
      requesterName: input.requesterName ?? '',
      requesterEmail: input.requesterEmail ?? '',
      requesterPhone: input.requesterPhone ?? '',
      teacherName: input.teacherName ?? '',
      school: input.school ?? '',
      district: input.district ?? '',
      incidentDate: input.incidentDate ?? '',
      description: input.description ?? '',
      extractedText: input.extractedText ?? '',
      attachmentNames: input.attachmentNames ?? [],
      status: 'Received',
      riskLevel: 'Unscored',
      retrievalScore: 0,
      allegationCategories: [],
      missingFields: [],
      suggestedCodes: [],
      auditCount: 1,
      lastAuditId: auditRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor.uid,
    };
    const batch = writeBatch(firestore);
    batch.set(caseRef, payload);
    batch.set(auditRef, {
      event: 'CaseSubmitted',
      actor: actor.email,
      actorUid: actor.uid,
      detail: 'Complaint entered through the structured intake form.',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return caseRef.id;
  }

  async saveTriage(caseId: string, result: TriageResult, actor: UserProfile): Promise<void> {
    const nextStatus = result.missingFields.length ? 'NeedsInfo' : 'ReadyForReview';
    const caseRef = doc(firestore, 'cases', caseId);
    const auditRef = doc(collection(caseRef, 'audit'));
    const batch = writeBatch(firestore);
    batch.update(caseRef, {
      ...result,
      status: nextStatus,
      auditCount: increment(1),
      lastAuditId: auditRef.id,
      updatedAt: serverTimestamp(),
      triagedBy: actor.uid,
    });
    batch.set(auditRef, {
      event: 'PolicyTriageCompleted',
      actor: actor.email,
      actorUid: actor.uid,
      detail: `${result.retrievalMethod} ranked ${result.suggestedCodes.length} cited policy section(s); deterministic rules produced risk, categories, completeness, and the synopsis.`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  async review(
    caseId: string,
    action: ReviewAction,
    actor: UserProfile,
    notes: string,
  ): Promise<void> {
    const status =
      action === 'approve' ? 'Approved' : action === 'sendBack' ? 'NeedsInfo' : 'Escalated';
    const detail =
      action === 'approve'
        ? 'Reviewer approved the triage recommendation and team assignment.'
        : action === 'sendBack'
          ? 'Reviewer requested additional information.'
          : 'Reviewer escalated the complaint for senior review.';
    const current = this.find(caseId);
    const caseRef = doc(firestore, 'cases', caseId);
    const auditRef = doc(collection(caseRef, 'audit'));
    const batch = writeBatch(firestore);
    batch.update(caseRef, {
      status,
      reviewerNotes: notes,
      assignedTeam:
        action === 'approve' ? (current.recommendedTeam ?? '') : (current.assignedTeam ?? ''),
      auditCount: increment(1),
      lastAuditId: auditRef.id,
      updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      event: action === 'approve' ? 'Approved' : action === 'sendBack' ? 'SentBack' : 'Escalated',
      actor: actor.email,
      actorUid: actor.uid,
      detail: notes ? `${detail} Reason: ${notes}` : detail,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  private find(caseId: string): ComplaintCase {
    return this.cases().find((item) => item.id === caseId) ?? SAMPLE_CASES[0];
  }

  private mapCase(snapshot: QueryDocumentSnapshot<DocumentData>): ComplaintCase {
    const data = snapshot.data();
    const date = (value: unknown): string =>
      value instanceof Timestamp
        ? value.toDate().toISOString()
        : String(value ?? new Date().toISOString());
    return {
      id: snapshot.id,
      caseNumber: data['caseNumber'] ?? snapshot.id,
      requesterName: data['requesterName'] ?? '',
      requesterEmail: data['requesterEmail'] ?? '',
      requesterPhone: data['requesterPhone'] ?? '',
      teacherName: data['teacherName'] ?? '',
      school: data['school'] ?? '',
      district: data['district'] ?? '',
      incidentDate: data['incidentDate'] ?? '',
      description: data['description'] ?? '',
      extractedText: data['extractedText'] ?? '',
      attachmentNames: data['attachmentNames'] ?? [],
      status: data['status'] ?? 'Received',
      riskLevel: data['riskLevel'] ?? 'Unscored',
      retrievalScore: Number(data['retrievalScore'] ?? data['confidence'] ?? 0),
      allegationCategories: data['allegationCategories'] ?? [],
      missingFields: data['missingFields'] ?? [],
      triageSummary: data['triageSummary'] ?? data['aiSummary'] ?? '',
      suggestedCodes: data['suggestedCodes'] ?? [],
      recommendedTeam: data['recommendedTeam'] ?? '',
      retrievalMethod: data['retrievalMethod'] ?? (data['model'] ? String(data['model']) : ''),
      assignedTeam: data['assignedTeam'] ?? '',
      reviewerNotes: data['reviewerNotes'] ?? '',
      createdAt: date(data['createdAt']),
      updatedAt: date(data['updatedAt']),
      auditCount: Number(data['auditCount'] ?? 0),
    };
  }
}
