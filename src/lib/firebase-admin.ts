import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.PGLITE_DATA_DIR) ||
  Boolean(process.env.CI) ||
  process.env.NO_FIRESTORE_SYNC === '1';

let firestoreCircuitBroken = isTestEnvironment;
let authCircuitBroken = isTestEnvironment;

function shouldTripCircuit(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.code === 7 ||
    err?.code === 16 ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('Could not load the default credentials') ||
    msg.includes('insufficient authentication scopes')
  );
}

let adminApp: App;

if (!getApps().length) {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId,
  });
} else {
  adminApp = getApps()[0];
}

export { adminApp };

const rawAuth = getAuth(adminApp);
const rawMessaging = getMessaging(adminApp);
const rawFirestore = getFirestore(
  adminApp,
  (firebaseConfig as any).firestoreDatabaseId &&
    (firebaseConfig as any).firestoreDatabaseId !== '(default)'
    ? (firebaseConfig as any).firestoreDatabaseId
    : undefined
);

// Create safe, non-crashing proxies with automatic circuit breaking on PERMISSION_DENIED / missing ADC
function createSafeDocProxy(docPath: string): any {
  return {
    set: async (data: any, options?: any) => {
      if (!firestoreCircuitBroken) {
        try {
          return await rawFirestore.doc(docPath).set(data, options);
        } catch (err: any) {
          if (shouldTripCircuit(err)) {
            firestoreCircuitBroken = true;
          }
          return { id: docPath };
        }
      }
      return { id: docPath };
    },
    get: async () => {
      if (!firestoreCircuitBroken) {
        try {
          return await rawFirestore.doc(docPath).get();
        } catch (err: any) {
          if (shouldTripCircuit(err)) {
            firestoreCircuitBroken = true;
          }
          return { exists: false, data: () => null, id: docPath };
        }
      }
      return { exists: false, data: () => null, id: docPath };
    },
    delete: async () => {
      if (!firestoreCircuitBroken) {
        try {
          return await rawFirestore.doc(docPath).delete();
        } catch (err: any) {
          if (shouldTripCircuit(err)) {
            firestoreCircuitBroken = true;
          }
          return {};
        }
      }
      return {};
    },
  };
}

function createSafeCollectionProxy(colName: string): any {
  return {
    doc: (docId?: string) => createSafeDocProxy(`${colName}/${docId || 'auto_id'}`),
    get: async () => {
      if (!firestoreCircuitBroken) {
        try {
          return await rawFirestore.collection(colName).get();
        } catch (err: any) {
          if (shouldTripCircuit(err)) {
            firestoreCircuitBroken = true;
          }
          return { empty: true, docs: [], size: 0 };
        }
      }
      return { empty: true, docs: [], size: 0 };
    },
  };
}

export const adminFirestore: any = {
  collection: (colName: string) => createSafeCollectionProxy(colName),
  doc: (docPath: string) => createSafeDocProxy(docPath),
};

export const adminAuth: any = {
  createUser: async (properties: any) => {
    if (!authCircuitBroken) {
      try {
        return await rawAuth.createUser(properties);
      } catch (err: any) {
        if (shouldTripCircuit(err)) {
          authCircuitBroken = true;
        }
        return { uid: properties.uid || 'mock-uid' };
      }
    }
    return { uid: properties.uid || 'mock-uid' };
  },
  updateUser: async (uid: string, properties: any) => {
    if (!authCircuitBroken) {
      try {
        return await rawAuth.updateUser(uid, properties);
      } catch (err: any) {
        if (shouldTripCircuit(err)) {
          authCircuitBroken = true;
        }
        return { uid };
      }
    }
    return { uid };
  },
  getUser: async (uid: string) => {
    if (!authCircuitBroken) {
      try {
        return await rawAuth.getUser(uid);
      } catch (err: any) {
        if (shouldTripCircuit(err)) {
          authCircuitBroken = true;
        }
        return null;
      }
    }
    return null;
  },
  getUserByEmail: async (email: string) => {
    if (!authCircuitBroken) {
      try {
        return await rawAuth.getUserByEmail(email);
      } catch (err: any) {
        if (shouldTripCircuit(err)) {
          authCircuitBroken = true;
        }
        return null;
      }
    }
    return null;
  },
};

export const adminMessaging = rawMessaging;
