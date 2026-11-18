import { Injectable, signal } from '@angular/core';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../firebase';
import { UserProfile } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    onAuthStateChanged(firebaseAuth, async (user) => {
      this.user.set(user);
      this.profile.set(null);
      if (user) {
        try {
          const snapshot = await getDoc(doc(firestore, 'users', user.uid));
          const data = snapshot.data();
          this.profile.set({
            uid: user.uid,
            email: user.email ?? '',
            displayName: String(data?.['displayName'] ?? user.email?.split('@')[0] ?? 'Reviewer'),
            role: data?.['role'] ?? 'Reviewer',
          });
        } catch {
          this.profile.set({
            uid: user.uid,
            email: user.email ?? '',
            displayName: user.email?.split('@')[0] ?? 'Reviewer',
            role: 'Reviewer',
          });
        }
      }
      this.loading.set(false);
    });
  }

  async login(email: string, password: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } catch (error: any) {
      const code = String(error?.code ?? '');
      this.error.set(
        code.includes('invalid-credential')
          ? 'The email or password is incorrect.'
          : 'Sign-in failed. Please try again.',
      );
      this.loading.set(false);
      throw error;
    }
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
  }
}
