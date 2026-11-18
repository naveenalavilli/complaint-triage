import { Injectable, signal } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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

  start(): void {
    this.unsubscribe?.();
    this.loading.set(true);
    const caseQuery = query(collection(firestore, 'cases'), orderBy('createdAt', 'desc'));
    this.unsubscribe = onSnapshot(
      caseQuery,
      (snapshot) => {
        const cases = snapshot.docs.map((item) => this.mapCase(item));
        this.cases.set(cases.length ? cases : SAMPLE_CASES);
        this.loading.set(false);
        this.error.set('');
      },
      () => {
        this.cases.set(SAMPLE_CASES);
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
    const suffix = String(now.getTime()).slice(-6);
    const caseNumber = `TC-${now.getFullYear()}-${suffix}`;
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
      confidence: 0,
      allegationCategories: [],
      missingFields: [],
      suggestedCodes: [],
      auditCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor.uid,
    };
    const created = await addDoc(collection(firestore, 'cases'), payload);
    await addDoc(collection(firestore, 'cases', created.id, 'audit'), {
      event: 'CaseSubmitted',
      actor: actor.email,
      detail: 'Complaint entered through the structured intake form.',
      createdAt: serverTimestamp(),
    });
    return created.id;
  }

  async saveTriage(caseId: string, result: TriageResult, actor: UserProfile): Promise<void> {
    const nextStatus = result.missingFields.length ? 'NeedsInfo' : 'ReadyForReview';
    await updateDoc(doc(firestore, 'cases', caseId), {
      ...result,
      status: nextStatus,
      auditCount: this.find(caseId).auditCount + 1,
      updatedAt: serverTimestamp(),
      triagedBy: actor.uid,
    });
    await addDoc(collection(firestore, 'cases', caseId, 'audit'), {
      event: 'AiTriageCompleted',
      actor: actor.email,
      detail: `${result.model} produced a grounded draft with ${result.suggestedCodes.length} citation(s).`,
      createdAt: serverTimestamp(),
    });
  }

  async review(
    caseId: string,
    action: ReviewAction,
    actor: UserProfile,
    notes: string,
  ): Promise<void> {
    const current = this.find(caseId);
    const status = action === 'approve' ? 'Approved' : action === 'sendBack' ? 'NeedsInfo' : 'Escalated';
    const detail =
      action === 'approve'
        ? 'Reviewer approved the draft recommendation.'
        : action === 'sendBack'
          ? 'Reviewer requested additional information.'
          : 'Reviewer escalated the complaint for senior review.';
    await updateDoc(doc(firestore, 'cases', caseId), {
      status,
      reviewerNotes: notes,
      assignedTeam: action === 'approve' ? current.recommendedTeam ?? '' : current.assignedTeam ?? '',
      auditCount: current.auditCount + 1,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(firestore, 'cases', caseId, 'audit'), {
      event: action === 'approve' ? 'Approved' : action === 'sendBack' ? 'SentBack' : 'Escalated',
      actor: actor.email,
      detail: notes ? `${detail} Reason: ${notes}` : detail,
      createdAt: serverTimestamp(),
    });
  }

  private find(caseId: string): ComplaintCase {
    return this.cases().find((item) => item.id === caseId) ?? SAMPLE_CASES[0];
  }

  private mapCase(snapshot: QueryDocumentSnapshot<DocumentData>): ComplaintCase {
    const data = snapshot.data();
    const date = (value: unknown): string =>
      value instanceof Timestamp ? value.toDate().toISOString() : String(value ?? new Date().toISOString());
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
      confidence: Number(data['confidence'] ?? 0),
      allegationCategories: data['allegationCategories'] ?? [],
      missingFields: data['missingFields'] ?? [],
      aiSummary: data['aiSummary'] ?? '',
      suggestedCodes: data['suggestedCodes'] ?? [],
      recommendedTeam: data['recommendedTeam'] ?? '',
      assignedTeam: data['assignedTeam'] ?? '',
      reviewerNotes: data['reviewerNotes'] ?? '',
      createdAt: date(data['createdAt']),
      updatedAt: date(data['updatedAt']),
      auditCount: Number(data['auditCount'] ?? 0),
    };
  }
}
