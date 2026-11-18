import { initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment';

export const firebaseApp = initializeApp(environment.firebase);
const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
export const firebaseAppCheck = environment.appCheck.productionHosts.includes(hostname)
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(environment.appCheck.recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : undefined;
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
