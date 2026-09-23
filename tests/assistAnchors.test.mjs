import assert from 'node:assert/strict';
import test from 'node:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  assistAnchors,
  getAssistAnchor,
  setAssistAnchorAction,
} from '../src/components/editor/assistAnchors.ts';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {},
  },
});

const makeState = () => {
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('alpha beta')])]),
    plugins: [assistAnchors],
  });
  state = state.apply(
    setAssistAnchorAction(state.tr, {
      type: 'add',
      anchor: { id: 'job', from: 7, to: 11, valid: true, status: 'running' },
    }),
  );
  return state;
};

test('typing before the selected range moves its anchor and keeps replacement available', () => {
  let state = makeState();
  state = state.apply(state.tr.insertText('prefix ', 1));
  assert.deepEqual(getAssistAnchor(state, 'job'), {
    id: 'job',
    from: 14,
    to: 18,
    valid: true,
    status: 'running',
  });
});

test('editing inside the selected range blocks replacement', () => {
  let state = makeState();
  state = state.apply(state.tr.insertText('X', 8));
  assert.equal(getAssistAnchor(state, 'job')?.valid, false);
});

test('deleting part of the selected range blocks replacement', () => {
  let state = makeState();
  state = state.apply(state.tr.delete(7, 8));
  assert.equal(getAssistAnchor(state, 'job')?.valid, false);
});

test('typing after the selected range keeps replacement available', () => {
  let state = makeState();
  state = state.apply(state.tr.insertText(' later', 11));
  assert.equal(getAssistAnchor(state, 'job')?.valid, true);
});
