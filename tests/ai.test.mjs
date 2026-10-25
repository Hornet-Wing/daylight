import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTasks, TASK_SCHEMA, MODEL, ESTIMATE_BLOCKS, loadAI } from '../dist/ai.js';
import { validateTask, buildPlan } from '../dist/core.js';
const prediction = {category:'personal',priority:'should',duration:30};
const fake = value => ({chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})}}});

test('AI request classifies one source line with a small schema and a concrete example', async () => {
  let sent;
  const engine={chat:{completions:{create:async request=>{sent=request;return {choices:[{message:{content:JSON.stringify(prediction)}}]};}}}};
  const [task]=await extractTasks('Call dentist, high priority, 15min, before 5pm','2026-10-25',engine);
  assert.equal(task.duration,15); assert.equal(task.priority,'must'); assert.equal(task.deadline,'17:00');
  assert.match(MODEL,/Qwen2.5/);
  assert.equal(sent.response_format.type,'json_object'); assert.equal(sent.response_format.schema,TASK_SCHEMA);
  assert.deepEqual(JSON.parse(TASK_SCHEMA).required,['category','priority','duration']);
  assert.match(sent.messages.at(-1).content,/Call dentist/);
  assert.equal(sent.messages.at(-2).role,'assistant');
  assert.doesNotMatch(sent.messages[0].content,/2026-10-25/);
});

test('every input line becomes a task even if the model would omit or rewrite its title', async () => {
  const source=['Enter Hacktoberfest week 3','Pack for the trip',"Clean the cat’s food bowl"];
  const seen=[], progress=[];
  const engine={chat:{completions:{create:async req=>{seen.push(req.messages.at(-1).content);return {choices:[{message:{content:JSON.stringify({...prediction,title:'Do something else'})}}]};}}}};
  const tasks=await extractTasks(source.join('\n'),'2026-10-25',engine,(i,n)=>progress.push([i,n]));
  assert.deepEqual(tasks.map(t=>t.title),source);
  assert.deepEqual(seen,source);
  assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
});

test('hallucinated timestamps and valid-looking times from the model cannot constrain a task', async () => {
  for(const invented of ['2026-10-24 23:59:59','17:00']){
    const tasks=await extractTasks('Pack for the trip','2026-10-25',fake({...prediction,earliest:invented,deadline:invented}));
    assert.equal(tasks[0].earliest,''); assert.equal(tasks[0].deadline,''); assert.equal(tasks[0].timeWarning,'');
  }
});

test('explicit source duration, category, priority and time override conflicting predictions', async () => {
  const [task]=await extractTasks('Personal: pack, high priority, 45 min, after 9am, before 5pm','2026-10-25',fake({category:'work',priority:'could',duration:120,earliest:'00:00',deadline:'23:59'}));
  assert.equal(task.category,'personal'); assert.equal(task.priority,'must'); assert.equal(task.duration,45);
  assert.equal(task.earliest,'09:00'); assert.equal(task.deadline,'17:00');
});

test('malformed model responses and invalid categories are rejected before saving', async () => {
  const engine={chat:{completions:{create:async()=>({choices:[{message:{content:'not json'}}]})}}};
  await assert.rejects(()=>extractTasks('A task','2026-10-25',engine),/incomplete details for task 1/);
  await assert.rejects(()=>extractTasks('A task','2026-10-25',fake({...prediction,category:'unknown'})),/work or personal/);
});

test('blank input and excessive task counts are rejected before invoking the model', async () => {
  const engine={chat:{completions:{create:async()=>{assert.fail('Model should not be called');}}}};
  await assert.rejects(()=>extractTasks('   ','2026-10-25',engine),/Write between/);
  await assert.rejects(()=>extractTasks(Array.from({length:13},(_,i)=>`Task ${i}`).join('\n'),'2026-10-25',engine),/up to 12 tasks/);
});

test('failed classification on a later line reports the source position rather than dropping it', async () => {
  let count=0;
  const engine={chat:{completions:{create:async()=>{if(++count===2)throw 'GPU device was lost';return {choices:[{message:{content:JSON.stringify(prediction)}}]};}}}};
  await assert.rejects(()=>extractTasks('First\nSecond\nThird','2026-10-25',engine),/Task 2 of 3/);
});

test('unsupported hardware produces a manual-entry error', async () => {
  await assert.rejects(()=>loadAI(),/WebGPU/);
});

test('generation schema uses structural types and enums without dates or regex constraints', () => {
  const schema=JSON.parse(TASK_SCHEMA);
  assert.deepEqual(Object.keys(schema.properties),['category','priority','duration']);
  assert.equal(schema.additionalProperties,false);
  assert.doesNotMatch(TASK_SCHEMA,/pattern|minimum|maximum|deadline|earliest|title/);
});

test('generation cannot turn a bare week number into an invalid duration', async () => {
  let request;
  const engine={chat:{completions:{create:async r=>{request=r;return {choices:[{message:{content:JSON.stringify(prediction)}}]};}}}};
  await extractTasks('Enter an online event, week 3','2026-10-25',engine);
  const durations=JSON.parse(request.response_format.schema).properties.duration.enum;
  assert.deepEqual(durations,ESTIMATE_BLOCKS);
  assert.ok(!durations.includes(3));
  assert.ok(durations.every(n=>Number.isInteger(n)&&n>=5&&n<=480));
});

test('explicit user estimates are preserved even when not in the model estimate menu', async () => {
  const [task]=await extractTasks('Work: review changes, 37 minutes','2026-10-25',fake({...prediction,duration:45}));
  assert.equal(task.duration,37);
  assert.equal(task.category,'work');
});

test('bad model estimates remain editable and must be corrected before scheduling', async () => {
  const [suggestion]=await extractTasks('Call dentist','2026-10-25',fake({...prediction,duration:0}));
  assert.equal(suggestion.duration,0); assert.match(suggestion.estimateWarning,/0 minutes/);
  assert.throws(()=>validateTask(suggestion));
  const corrected={...validateTask({...suggestion,duration:15}),id:'reviewed'};
  const settings={date:'2026-10-25',start:'09:00',end:'18:00',mode:'mixed',workStart:'09:00',workEnd:'17:00',breakMinutes:10};
  assert.equal(buildPlan([corrected],[],settings).blocks.find(b=>b.kind==='task').duration,15);
});
