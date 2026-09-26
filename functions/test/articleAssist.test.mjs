import assert from 'node:assert/strict';
import test from 'node:test';
import admin from 'firebase-admin';
import functions from '../lib/index.js';

const { articleAssist } = functions;
const data = {
  kind: 'relatedMaterial',
  noteMarkdown: 'A draft paragraph.',
  blocks: [{ id: 'block-0', type: 'paragraph', text: 'A draft paragraph.' }],
  sourceNoteIds: ['another-user-note'],
};

test('articleAssist rejects unauthenticated requests', async () => {
  await assert.rejects(articleAssist.run({ data, auth: null }), { code: 'unauthenticated' });
});

test('articleAssist checks allowedUsers before source notes', async () => {
  const collections = [];
  Object.defineProperty(admin, 'firestore', {
    configurable: true,
    value: () => ({
      collection: (name) => {
        collections.push(name);
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    }),
  });
  try {
    await assert.rejects(articleAssist.run({ data, auth: { uid: 'blocked' } }), {
      code: 'permission-denied',
    });
    assert.deepEqual(collections, ['allowedUsers']);
  } finally {
    delete admin.firestore;
  }
});

test('articleAssist rejects invalid blocks before AI', async () => {
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
      articleAssist.run({
        data: { ...data, blocks: [{ ...data.blocks[0], id: '../bad' }] },
        auth: { uid: 'allowed' },
      }),
      { code: 'invalid-argument' },
    );
  } finally {
    delete admin.firestore;
  }
});

test('articleAssist never sends another user’s note to AI', async () => {
  Object.defineProperty(admin, 'firestore', {
    configurable: true,
    value: () => ({
      collection: (name) => ({
        doc: () => ({
          get: async () =>
            name === 'allowedUsers'
              ? { exists: true, data: () => ({ allowed: true }) }
              : {
                  id: 'another-user-note',
                  data: () => ({ userId: 'other', markdown: 'Private text' }),
                },
        }),
      }),
    }),
  });
  try {
    const response = await articleAssist.run({ data, auth: { uid: 'allowed' } });
    assert.deepEqual(response, { kind: 'relatedMaterial', suggestions: [] });
  } finally {
    delete admin.firestore;
  }
});
