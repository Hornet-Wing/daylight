import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, showNotice } from '../dist/errors.js';
import { extractTasks } from '../dist/ai.js';

function noticeElement() {
  return { textContent: '', hidden: true, classList: { toggle() {} }, setAttribute() {} };
}

test('error messages preserve worker strings and regular Error messages', () => {
  assert.equal(errorMessage('  GPU device was lost  '), 'GPU device was lost');
  assert.equal(errorMessage(new Error('Model download failed')), 'Model download failed');
  assert.equal(errorMessage({ message: 'Worker failed' }), 'Worker failed');
});

test('empty or unfamiliar failures always produce visible notice text', () => {
  for (const failure of [undefined, null, '', '   ', {}, 0, new Error('')]) {
    const element = noticeElement();
    showNotice(element, failure, true);
    assert.ok(element.textContent.trim().length > 0);
    assert.equal(element.hidden, false);
  }
});

test('a plain-text WebLLM rejection reaches the notice instead of a blank red box', async () => {
  const engine = { chat: { completions: { create: async () => { throw 'Error: GPU device was lost'; } } } };
  const element = noticeElement();
  try {
    await extractTasks('Call the dentist', '2026-10-25', engine);
    assert.fail('The failing worker must reject');
  } catch (error) {
    showNotice(element, error, true);
  }
  assert.equal(element.textContent, 'Could not read your notes. Error: GPU device was lost (Task 1 of 1.)');
  assert.equal(element.hidden, false);
});

test('an empty worker rejection keeps actionable fallback text', async () => {
  const engine = { chat: { completions: { create: async () => { throw undefined; } } } };
  await assert.rejects(() => extractTasks('Call dentist', '2026-10-25', engine), /Could not read your notes.*Try a shorter note/);
});
