import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComplaintCase } from './models';
import { AiTriageService } from './services/ai-triage.service';
import { AuthService } from './services/auth.service';
import { CaseService } from './services/case.service';

type View = 'queue' | 'new' | 'audit';

interface IntakeDraft {
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  teacherName: string;
  school: string;
  district: string;
  incidentDate: string;
  description: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  readonly auth = inject(AuthService);
  readonly caseService = inject(CaseService);
  readonly ai = inject(AiTriageService);

  readonly view = signal<View>('queue');
  readonly selectedId = signal('');
  readonly query = signal('');
  readonly statusFilter = signal('All');
  readonly reviewerNotes = signal('');
  readonly busy = signal('');
  readonly notice = signal('');
  readonly ocrProgress = signal('');
  readonly attachmentNames = signal<string[]>([]);
  readonly extractedText = signal('');

  loginEmail = '';
  loginPassword = '';
  intake = this.emptyIntake();

  readonly filteredCases = computed(() => {
    const query = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    return this.caseService.cases().filter((item) => {
      const matchesStatus = status === 'All' || item.status === status;
      const haystack = `${item.caseNumber} ${item.requesterName} ${item.teacherName} ${item.school} ${item.description}`.toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  });

  readonly selectedCase = computed(() =>
    this.caseService.cases().find((item) => item.id === this.selectedId()),
  );

  readonly metrics = computed(() => {
    const cases = this.caseService.cases();
    return {
      total: cases.length,
      review: cases.filter((item) => item.status === 'ReadyForReview').length,
      high: cases.filter((item) => item.riskLevel === 'High').length,
      needsInfo: cases.filter((item) => item.status === 'NeedsInfo').length,
    };
  });

  readonly recentCases = computed(() => this.caseService.cases().slice(0, 6));

  private readonly authWatcher = effect(() => {
    if (this.auth.profile()) {
      this.caseService.start();
    } else if (!this.auth.loading()) {
      this.caseService.stop();
      this.selectedId.set('');
    }
  });

  async login(): Promise<void> {
    if (!this.loginEmail || !this.loginPassword) return;
    this.busy.set('login');
    try {
      await this.auth.login(this.loginEmail, this.loginPassword);
      this.notice.set('Signed in successfully.');
    } finally {
      this.busy.set('');
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.view.set('queue');
  }

  openCase(item: ComplaintCase): void {
    this.selectedId.set(item.id);
    this.reviewerNotes.set(item.reviewerNotes ?? '');
  }

  closeCase(): void {
    this.selectedId.set('');
    this.reviewerNotes.set('');
  }

  changeView(view: View): void {
    this.view.set(view);
    this.notice.set('');
    this.closeCase();
  }

  setQuery(value: string): void {
    this.query.set(value);
  }

  setStatus(value: string): void {
    this.statusFilter.set(value);
  }

  async filesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.attachmentNames.set(files.map((file) => file.name));
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;

    this.busy.set('ocr');
    this.ocrProgress.set('Preparing local OCR…');
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', undefined, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          this.ocrProgress.set(`Reading image… ${Math.round(message.progress * 100)}%`);
        }
      },
    });
    try {
      const text: string[] = [];
      for (const file of images) {
        this.ocrProgress.set(`Reading ${file.name}…`);
        const result = await worker.recognize(file);
        text.push(result.data.text.trim());
      }
      this.extractedText.set(text.filter(Boolean).join('\n\n'));
      this.ocrProgress.set(`OCR complete for ${images.length} image${images.length === 1 ? '' : 's'}.`);
    } catch {
      this.ocrProgress.set('OCR could not read this attachment. It can still be submitted for review.');
    } finally {
      await worker.terminate();
      this.busy.set('');
    }
  }

  async submitCase(): Promise<void> {
    const profile = this.auth.profile();
    if (!profile || !this.intake.requesterName || !this.intake.requesterEmail || !this.intake.description) return;
    this.busy.set('submit');
    try {
      const id = await this.caseService.createCase(
        {
          ...this.intake,
          attachmentNames: this.attachmentNames(),
          extractedText: this.extractedText(),
        },
        profile,
      );
      this.notice.set('Complaint submitted. It is ready for AI-assisted triage.');
      this.intake = this.emptyIntake();
      this.attachmentNames.set([]);
      this.extractedText.set('');
      this.view.set('queue');
      this.selectedId.set(id);
    } catch {
      this.notice.set('The complaint could not be saved. Please try again.');
    } finally {
      this.busy.set('');
    }
  }

  async runTriage(item: ComplaintCase): Promise<void> {
    const profile = this.auth.profile();
    if (!profile) return;
    this.busy.set('triage');
    this.notice.set('');
    try {
      const result = await this.ai.triage(item);
      await this.caseService.saveTriage(item.id, result, profile);
      this.notice.set('Grounded draft created. A human reviewer still controls the decision.');
    } catch {
      this.notice.set('Triage failed. The case was not changed.');
    } finally {
      this.busy.set('');
    }
  }

  async review(action: 'approve' | 'sendBack' | 'escalate'): Promise<void> {
    const profile = this.auth.profile();
    const item = this.selectedCase();
    if (!profile || !item) return;
    this.busy.set(action);
    try {
      await this.caseService.review(item.id, action, profile, this.reviewerNotes());
      this.notice.set(
        action === 'approve'
          ? 'Recommendation approved and routed.'
          : action === 'sendBack'
            ? 'Case sent back for more information.'
            : 'Case escalated for senior review.',
      );
      this.closeCase();
    } catch {
      this.notice.set('The review action could not be saved.');
    } finally {
      this.busy.set('');
    }
  }

  setNotes(value: string): void {
    this.reviewerNotes.set(value);
  }

  riskClass(risk: string): string {
    return `risk-${risk.toLowerCase()}`;
  }

  statusClass(status: string): string {
    return `status-${status.toLowerCase().replaceAll(' ', '-')}`;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Just now'
      : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  ngOnDestroy(): void {
    this.caseService.stop();
  }

  private emptyIntake(): IntakeDraft {
    return {
      requesterName: '',
      requesterEmail: '',
      requesterPhone: '',
      teacherName: '',
      school: '',
      district: '',
      incidentDate: '',
      description: '',
    };
  }
}
