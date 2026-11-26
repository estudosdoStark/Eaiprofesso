import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope(CALENDAR_SCOPE);

// In-memory access token cache ONLY (never stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration or network connectivity.');
    }
  }
}
testConnection();

let authStateCallback: ((user: User | null, accessToken: string | null) => void) | null = null;

export const initAuth = (
  onUserChange: (user: User | null, accessToken: string | null) => void
) => {
  authStateCallback = onUserChange;
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user) {
      cachedAccessToken = null;
      onUserChange(null, null);
    } else if (!isSigningIn) {
      onUserChange(user, cachedAccessToken);
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null }> => {
  try {
    isSigningIn = true;
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    if (authStateCallback) {
      authStateCallback(result.user, cachedAccessToken);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'O navegador bloqueou a janela de login do Google. Libere os pop-ups para este site e tente novamente.'
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('A janela de login do Google foi fechada antes de concluir a entrada.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Domínio não autorizado no Firebase Authentication. Verifique os domínios autorizados no console do Firebase.'
      );
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
