import assert from 'node:assert/strict';
import test from 'node:test';
import { Schema } from '@tiptap/pm/model';
import {
  collectArticleBlocks,
  findCurrentArticleBlock,
  getInvalidArticleBlockIds,
} from '../src/components/editor/articleBlocks.ts';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    heading: { content: 'text*', group: 'block' },
    paragraph: { content: 'text*', group: 'block' },
    text: {},
  },
});

const paragraph = (text) => schema.node('paragraph', null, [schema.text(text)]);
const heading = (text) => schema.node('heading', null, [schema.text(text)]);

test('article blocks find a paragraph after earlier text changes', () => {
  const original = schema.node('doc', null, [
    heading('Title'),
    paragraph('First'),
    paragraph('Target'),
  ]);
  const target = collectArticleBlocks(original)[2];
  const updated = schema.node('doc', null, [
    heading('New title'),
    paragraph('First'),
    paragraph('Target'),
  ]);
  assert.equal(findCurrentArticleBlock(updated, target)?.text, 'Target');
});

test('article blocks reject an edited or duplicated target', () => {
  const original = schema.node('doc', null, [paragraph('Target')]);
  const target = collectArticleBlocks(original)[0];
  assert.equal(
    findCurrentArticleBlock(schema.node('doc', null, [paragraph('Changed')]), target),
    null,
  );
  assert.equal(
    findCurrentArticleBlock(
      schema.node('doc', null, [paragraph('Target'), paragraph('Target')]),
      target,
    ),
    null,
  );
});

test('an edited target stays invalid even if its original text is restored', () => {
  const target = collectArticleBlocks(schema.node('doc', null, [paragraph('Target')]))[0];
  const edited = schema.node('doc', null, [paragraph('Changed')]);
  const invalid = getInvalidArticleBlockIds(edited, [target]);
  const restored = schema.node('doc', null, [paragraph('Target')]);
  assert.deepEqual(getInvalidArticleBlockIds(restored, [target], invalid), [target.id]);
});
