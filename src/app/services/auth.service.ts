import { Injectable, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../firebase';
import { UserProfile } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  private registeringRequester = false;

  constructor() {
    onAuthStateChanged(firebaseAuth, async (user) => {
      this.user.set(user);
      this.profile.set(null);
      if (user) {
        try {
          const snapshot = await getDoc(doc(firestore, 'users', user.uid));
          if (!snapshot.exists()) {
            if (!this.registeringRequester) {
              this.error.set('This account does not have an application profile.');
              await signOut(firebaseAuth);
            }
          } else {
            const data = snapshot.data();
            this.profile.set({
              uid: user.uid,
              email: user.email ?? '',
              displayName: String(data['displayName'] ?? user.email?.split('@')[0] ?? 'User'),
              role: data['role'],
            });
          }
        } catch {
          if (!this.registeringRequester) {
            this.error.set('The account profile could not be loaded.');
            await signOut(firebaseAuth);
          }
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

  async registerRequester(displayName: string, email: string, password: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.registeringRequester = true;
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const profile: UserProfile = {
        uid: credential.user.uid,
        email: credential.user.email ?? email.trim(),
        displayName: displayName.trim(),
        role: 'Requester',
      };
      await setDoc(doc(firestore, 'users', credential.user.uid), {
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
        createdAt: serverTimestamp(),
      });
      this.user.set(credential.user);
      this.profile.set(profile);
    } catch (error: any) {
      const code = String(error?.code ?? '');
      this.error.set(
        code.includes('email-already-in-use')
          ? 'An account already exists for this email. Sign in instead.'
          : code.includes('weak-password')
            ? 'Use a password with at least six characters.'
            : 'Account creation failed. Please try again.',
      );
      throw error;
    } finally {
      this.registeringRequester = false;
      this.loading.set(false);
    }
  }

  clearError(): void {
    this.error.set('');
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
  }
}
