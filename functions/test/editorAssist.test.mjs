import assert from 'node:assert/strict';
import test from 'node:test';
import admin from 'firebase-admin';
import functions from '../lib/index.js';

const { editorAssist } = functions;

const request = {
  data: { kind: 'factCheck', selectedText: 'A claim', noteMarkdown: 'A claim' },
};

test('editorAssist rejects unauthenticated requests', async () => {
  await assert.rejects(editorAssist.run({ ...request, auth: null }), {
    code: 'unauthenticated',
  });
});

test('editorAssist rejects users outside allowedUsers', async () => {
  Object.defineProperty(admin, 'firestore', {
    configurable: true,
    value: () => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
    }),
  });
  try {
    await assert.rejects(editorAssist.run({ ...request, auth: { uid: 'blocked' } }), {
      code: 'permission-denied',
    });
  } finally {
    delete admin.firestore;
  }
});

test('editorAssist rejects invalid selection before invoking AI', async () => {
  Object.defineProperty(admin, 'firestore', {
    configurable: true,
    value: () => ({
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ allowed: true }) }) }),
      }),
    }),
  });
  try {
    await assert.rejects(
      editorAssist.run({
        ...request,
        data: { ...request.data, selectedText: '' },
        auth: { uid: 'allowed' },
      }),
      { code: 'invalid-argument' },
    );
  } finally {
    delete admin.firestore;
  }
});
