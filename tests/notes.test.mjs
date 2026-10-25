import test from 'node:test';
import assert from 'node:assert/strict';
import { noteLines, explicitDetails, groundSuggestion } from '../dist/notes.js';

test('one task per line preserves source wording and strips list bullets', () => {
  assert.deepEqual(noteLines('  - Pack for trip\r\n\n2. Feed cat\n• Submit entry '),['Pack for trip','Feed cat','Submit entry']);
});
test('notes without times leave constraints blank, including numbered event names', () => {
  for(const line of ['Enter Hacktoberfest week 3','Pack for holiday','Clean cat’s food bowl','Look after cats']){
    assert.deepEqual(explicitDetails(line),{earliest:'',deadline:''});
  }
});
test('source times are converted from explicit 24-hour and am/pm phrases', () => {
  assert.deepEqual(explicitDetails('Call before 5pm'),{earliest:'',deadline:'17:00'});
  assert.deepEqual(explicitDetails('Write after 09:30 before 17:15'),{earliest:'09:30',deadline:'17:15'});
  assert.equal(explicitDetails('Leave not before 12am').earliest,'00:00');
  assert.equal(explicitDetails('Finish by noon').deadline,'12:00');
  assert.equal(explicitDetails('Finish by 12pm').deadline,'12:00');
});
test('ambiguous hours, relative dates and unsupported date-times stay visible for correction', () => {
  assert.equal(explicitDetails('Call before 5').deadline,'5');
  assert.equal(explicitDetails('Call before lunch').deadline,'lunch');
  assert.equal(explicitDetails('Call before 5pm tomorrow').deadline,'5pm tomorrow');
  assert.equal(explicitDetails('Call before 2026-10-26 17:00').deadline,'2026-10-26 17:00');
  assert.equal(explicitDetails('Call after 25:00').earliest,'25:00');
  assert.equal(explicitDetails('Call before 5pm on Monday').deadline,'5pm on Monday');
  assert.equal(explicitDetails('Call before 5pm UTC').deadline,'5pm UTC');
});
test('explicit estimates convert units without changing an unusual stated estimate', () => {
  assert.equal(explicitDetails('Write for 2 hours').duration,120);
  assert.equal(explicitDetails('Walk, 1.5h').duration,90);
  assert.equal(explicitDetails('Focus, 1 hour 15 minutes').duration,75);
  assert.equal(explicitDetails('Odd task, 37min').duration,37);
});
test('grounding ignores all model-generated task names and time constraints', () => {
  assert.deepEqual(groundSuggestion('Clean the bowl',{title:'Wrong task',category:'personal',priority:'should',duration:5,earliest:'2026-10-24 23:59:59',deadline:'17:00'}),{title:'Clean the bowl',category:'personal',priority:'should',duration:5,earliest:'',deadline:''});
});
test('source metadata overrides model guesses without confusing work-out with a work tag', () => {
  const task=groundSuggestion('Personal: pack, high priority, 45 min',{category:'work',priority:'could',duration:120});
  assert.equal(task.category,'personal'); assert.equal(task.priority,'must'); assert.equal(task.duration,45);
  assert.equal(explicitDetails('Work out at the gym').category,undefined);
});
test('long or overfull note input explains the supported scope', () => {
  assert.throws(()=>noteLines('x'.repeat(181)),/Task 1 is too long/);
  assert.throws(()=>noteLines(Array.from({length:13},()=> 'Task').join('\n')),/up to 12/);
});
