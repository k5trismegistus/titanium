import * as functions from 'firebase-functions/v1';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const buildAllowedUserPayload = (user: admin.auth.UserRecord) => ({
  allowed: false,
  email: user.email ?? null,
  displayName: user.displayName ?? null,
  photoURL: user.photoURL ?? null,
  providerIds: (user.providerData ?? []).map((provider) => provider.providerId),
  authCreatedAt: user.metadata.creationTime ?? null,
  authLastSignInTime: user.metadata.lastSignInTime ?? null,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const createAllowedUserIfMissing = async (uid: string, payload: Record<string, unknown>) => {
  const docRef = db.collection('allowedUsers').doc(uid);
  try {
    await docRef.create(payload);
    return true;
  } catch (error) {
    const err = error as { code?: string | number };
    if (err?.code === 'already-exists' || err?.code === 6) {
      return false;
    }
    throw error;
  }
};

export const onAuthUserCreated = functions
  .region('asia-northeast1')
  .runWith({ memory: '512MB' })
  .auth.user()
  .onCreate(async (user) => {
    if (!user?.uid) return;
    await createAllowedUserIfMissing(user.uid, buildAllowedUserPayload(user));
  });

export const ensureAllowedUser = onCall(
  { region: 'asia-northeast1', memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = request.auth.uid;
    const user = await admin.auth().getUser(uid);
    const created = await createAllowedUserIfMissing(uid, buildAllowedUserPayload(user));
    return { created };
  },
);
