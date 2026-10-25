import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, minutes, validateTask, validateBackup, validateExtraction, extractionForReview, planText } from '../dist/core.js';
const settings = { date: '2026-10-23', start: '09:00', end: '18:00', mode: 'mixed', workStart: '09:00', workEnd: '17:00', breakMinutes: 10 };
const task = (id, changes = {}) => ({ id, title: id, category: 'work', priority: 'should', duration: 30, earliest: '', deadline: '', done: false, ...changes });
const fixed = (title, start, end) => ({ id: title, title, start, end });
const blocks = p => p.blocks.filter(b => b.kind === 'task');
test('priority applies equally to work and personal tasks in mixed mode', () => {
  const p = buildPlan([task('work-low', {priority:'could'}), task('personal-high', {category:'personal',priority:'must'}),task('work-med')], [], settings);
  assert.deepEqual(blocks(p).map(b => b.id), ['personal-high','work-med','work-low']);
});
test('tasks with the same priority are ordered by deadline, then input order', () => {
  const p = buildPlan([task('a'), task('b',{deadline:'10:00'}), task('c')], [], settings);
  assert.deepEqual(blocks(p).map(b => b.id), ['b','a','c']);
});
test('fixed commitments stay fixed and task blocks do not overlap', () => {
  const p = buildPlan([task('long',{duration:90}),task('short')], [fixed('meeting','09:30','10:30')], settings);
  assert.equal(p.blocks.find(b=>b.kind==='fixed').start,570);
  assert.equal(blocks(p).find(b=>b.id==='long').start,630);
  assert.equal(blocks(p).find(b=>b.id==='short').start,540);
  for(let i=1;i<p.blocks.length;i++)assert.ok(p.blocks[i].start>=p.blocks[i-1].end);
});
test('deadline too early produces explicit overflow rather than a late task', () => {
  const p = buildPlan([task('late',{duration:90,deadline:'10:00'})],[],settings);
  assert.equal(blocks(p).length,0); assert.match(p.deferred[0].reason,/10:00/);
});
test('earliest start and deadline both constrain the entire task', () => {
  const p=buildPlan([task('window',{earliest:'14:00',deadline:'15:00',duration:60})],[],settings);
  assert.equal(blocks(p)[0].start,840); assert.equal(blocks(p)[0].end,900);
});
test('overloaded day never shortens task estimates or extends day end', () => {
  const p=buildPlan([task('large',{duration:480}),task('second',{duration:90})],[],settings);
  assert.equal(blocks(p)[0].end-blocks(p)[0].start,480); assert.equal(p.deferred.length,1);
  assert.ok(p.blocks.every(b=>b.end<=1080));
});
test('breaks consume time and cannot overwrite appointments', () => {
  const p=buildPlan([task('a',{duration:25}),task('b')],[fixed('call','09:30','10:00')],settings);
  assert.equal(p.blocks.find(b=>b.kind==='break').end,570);
  assert.equal(blocks(p)[1].start,600);
});
test('breaks may be turned off', () => {
  const p=buildPlan([task('a'),task('b')],[],{...settings,breakMinutes:0});
  assert.equal(blocks(p)[1].start,570); assert.equal(p.blocks.filter(b=>b.kind==='break').length,0);
});
test('replanning skips completed tasks and never schedules before the cursor', () => {
  const p=buildPlan([task('done',{done:true}),task('pending')],[],settings,'15:30');
  assert.equal(blocks(p).length,1); assert.equal(blocks(p)[0].start,930);
});
test('replanning after the day ends defers remaining tasks', () => {
  const p=buildPlan([task('a')],[],settings,'20:00');
  assert.equal(blocks(p).length,0); assert.equal(p.capacity,0); assert.equal(p.deferred.length,1);
});
test('separate mode respects work and personal time boundaries', () => {
  const p=buildPlan([task('personal',{category:'personal'}),task('work')],[],{...settings,mode:'separate'});
  assert.equal(blocks(p).find(b=>b.id==='personal').start,1020);
  assert.equal(blocks(p).find(b=>b.id==='work').start,540);
});
test('overlapping appointments are rejected; adjacent appointments are allowed', () => {
  assert.throws(()=>buildPlan([],[fixed('a','09:00','10:00'),fixed('b','09:30','10:30')],settings),/overlap/);
  assert.doesNotThrow(()=>buildPlan([],[fixed('a','09:00','10:00'),fixed('b','10:00','10:30')],settings));
});
test('appointments outside the planning day are rejected', () => {
  assert.throws(()=>buildPlan([],[fixed('early','08:00','09:30')],settings),/inside your day/);
});
test('invalid dates, inverted day boundaries and invalid times are rejected', () => {
  assert.throws(()=>buildPlan([],[],{...settings,date:'2026-02-31'}),/valid planning date/);
  assert.throws(()=>buildPlan([],[],{...settings,end:'08:00'}),/end after/);
  assert.throws(()=>minutes('25:00'),/valid time/);
});
test('bad task durations, priorities and reversed task windows are rejected', () => {
  for(const duration of [-1,0,4,481,NaN,30.2])assert.throws(()=>validateTask(task('a',{duration})));
  assert.throws(()=>validateTask(task('a',{priority:'__proto__'})));
  assert.throws(()=>validateTask(task('a',{earliest:'16:00',deadline:'15:00'})));
});
test('duplicate task IDs are rejected', () => assert.throws(()=>buildPlan([task('a'),task('a')],[],settings),/unique ID/));
test('AI extraction validates every task before accepting the batch', () => {
  assert.throws(()=>validateExtraction({tasks:[task('a'),task('bad',{duration:-10})]}));
  assert.throws(()=>validateExtraction({tasks:[]}));
  assert.equal(validateExtraction({tasks:[task('a')]}).length,1);
});
test('review keeps valid tasks when another estimate needs correction', () => {
  const suggestions=extractionForReview({tasks:[task('valid'),task('bad',{duration:0})]});
  assert.equal(suggestions.length,2);
  assert.equal(suggestions[0].duration,30);
  assert.equal(suggestions[0].estimateWarning,'');
  assert.equal(suggestions[1].duration,0);
  assert.ok(suggestions[1].estimateWarning);
});
test('missing and fractional estimates are flagged without silently inventing a duration', () => {
  for(const duration of [undefined,null,'30 minutes',12.5]){
    const [suggestion]=extractionForReview({tasks:[task('bad',{duration})]});
    assert.ok(suggestion.estimateWarning);
    assert.equal(suggestion.duration,typeof duration==='number'?duration:'');
    assert.throws(()=>validateTask(suggestion));
  }
});
test('review flags malformed and reversed model times without discarding the other tasks', () => {
  const suggestions=extractionForReview({tasks:[task('valid'),task('bad',{earliest:'0',deadline:'N/A'}),task('reversed',{earliest:'16:00',deadline:'15:00'})]});
  assert.equal(suggestions.length,3);
  assert.equal(suggestions[0].timeWarning,'');
  assert.match(suggestions[1].timeWarning,/HH:MM/);
  assert.equal(suggestions[1].earliest,'0');
  assert.match(suggestions[2].timeWarning,/earlier/);
  assert.throws(()=>validateTask(suggestions[1]));
  assert.throws(()=>validateTask(suggestions[2]));
});
test('backup roundtrip preserves mixed preferences, progress and planning cursor', () => {
  const original={version:1,settings,tasks:[task('a',{done:true})],commitments:[],notes:'private notes',from:'14:30'};
  const restored=validateBackup(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.from,'14:30'); assert.equal(restored.tasks[0].done,true); assert.equal(restored.settings.mode,'mixed');
  assert.equal(restored.notes,'private notes');
  assert.throws(()=>validateBackup({...original,tasks:[task('a',{duration:0})]}));
});
test('export includes the appointments and explicitly unscheduled work', () => {
  const p=buildPlan([task('too-big',{duration:480})],[fixed('meeting','10:00','12:00')],settings);
  const text=planText(p,settings); assert.match(text,/10:00–12:00  meeting/); assert.match(text,/For another time/); assert.match(text,/too-big/);
});
test('many varied days preserve no-overlap, duration, boundary and accounting invariants', () => {
  for(let seed=1;seed<=120;seed++){
    const tasks=Array.from({length:12},(_,i)=>task(`t${i}`,{duration:5+((seed*17+i*31)%140),priority:['must','should','could'][(seed+i)%3],category:i%2?'work':'personal',earliest:i%4===0?'11:00':'',deadline:i%5===0?'15:00':''}));
    const p=buildPlan(tasks,[fixed('lunch','12:00','13:00'),fixed('call','15:30','16:00')],settings);
    for(let i=0;i<p.blocks.length;i++){
      const b=p.blocks[i];assert.ok(b.start>=540&&b.end<=1080&&b.end>b.start);
      if(i)assert.ok(b.start>=p.blocks[i-1].end);
      if(b.kind==='task'){assert.equal(b.end-b.start,b.duration);if(b.deadline)assert.ok(b.end<=minutes(b.deadline));if(b.earliest)assert.ok(b.start>=minutes(b.earliest));}
    }
    assert.equal(blocks(p).length+p.deferred.length,tasks.length);
    assert.equal(p.taskMinutes+p.blocks.filter(b=>b.kind==='break').reduce((n,b)=>n+b.end-b.start,0)+p.spareMinutes,p.capacity);
  }
});
