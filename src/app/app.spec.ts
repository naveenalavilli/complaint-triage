import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Complaint Triage');
  });

  it('should reserve approval for the Supervisor role', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.auth.profile.set({
      uid: 'reviewer',
      email: 'reviewer@example.test',
      displayName: 'Reviewer',
      role: 'Reviewer',
    });
    expect(app.canApprove()).toBeFalse();

    app.auth.profile.set({
      uid: 'supervisor',
      email: 'supervisor@example.test',
      displayName: 'Supervisor',
      role: 'Supervisor',
    });
    expect(app.canApprove()).toBeTrue();
  });
});
