import { buildPlan, clock, minutes, durationLabel, validateTask, validateBackup, planText } from './core.js';
import { aiReady, loadAI, extractTasks } from './ai.js';
import { errorMessage, showNotice } from './errors.js';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KEY = 'daylight-v1';
const AI_CONSENT_KEY = 'daylight-ai-enabled-v1';
let aiConsent = false;
try { aiConsent = localStorage.getItem(AI_CONSENT_KEY) === 'true'; } catch { /* Consent remains session-only if storage is unavailable. */ }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const uid = () => crypto.randomUUID();
const fresh = () => ({ version: 1, settings: { date: today(), start: '09:00', end: '20:00', workStart: '09:00', workEnd: '17:00', mode: 'mixed', breakMinutes: 10 }, tasks: [], commitments: [], notes: '' });
let state = fresh(), filter = 'all', from, plan, suggestions = [], busy = false;
function notify(value, error = false) { showNotice($('message'), value, error); }
try { const saved = localStorage.getItem(KEY); if (saved) state = validateBackup(JSON.parse(saved)); }
catch { notify('Your saved data could not be read. Restore a backup, or start a new plan. New edits will replace the unreadable save.', true); }
from = state.from || state.settings.start;
function save() {
  state.from = from;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { document.querySelector('.local-label').textContent = 'Session only — export a backup'; notify('This browser could not save the plan. Export a backup before closing this tab.', true); }
}
function syncSettings() {
  const s = state.settings;
  $('date').value = s.date; $('day-start').value = s.start; $('day-end').value = s.end;
  $('mode').value = s.mode; $('break-minutes').value = s.breakMinutes;
  $('work-start').value = s.workStart; $('work-end').value = s.workEnd;
  $('work-hours').hidden = s.mode === 'mixed'; $('plan-from').value = from;
  $('notes').value = state.notes;
}
function renderTasks() {
  $('task-count').textContent = state.tasks.filter(t => !t.done).length;
  const visible = state.tasks.filter(t => filter === 'all' || t.category === filter);
  $('task-list').innerHTML = visible.length ? visible.map(t => `<article class="task ${t.done ? 'done' : ''}"><button class="check" data-action="done" data-id="${escape(t.id)}" aria-label="${t.done ? 'Mark incomplete' : 'Complete'}: ${escape(t.title)}" aria-pressed="${t.done}">${t.done ? '✓' : ''}</button><div class="task-content"><div class="task-name">${escape(t.title)}</div><div class="task-meta"><span class="pill ${t.category}">${t.category === 'work' ? 'Work' : 'Personal'}</span><span class="priority ${t.priority}">${({must:'High',should:'Medium',could:'Low'})[t.priority]}</span><span>${durationLabel(t.duration)}</span>${t.deadline ? `<span>Due ${escape(t.deadline)}</span>` : ''}${t.earliest ? `<span>After ${escape(t.earliest)}</span>` : ''}</div></div><div class="task-actions"><button class="quiet" data-action="edit" data-id="${escape(t.id)}" aria-label="Edit ${escape(t.title)}">Edit</button><button class="quiet" data-action="delete" data-id="${escape(t.id)}" aria-label="Remove ${escape(t.title)}">×</button></div></article>`).join('') : `<div class="empty">${state.tasks.length ? 'No tasks in this view.' : 'An empty list, a fresh start.<br>Add a task or try the sample day.'}</div>`;
  $('appointment-count').textContent = state.commitments.length;
  $('appointment-list').innerHTML = state.commitments.map(c => `<div class="appointment-item"><div>${escape(c.title)}<span>${escape(c.start)}–${escape(c.end)}</span></div><button class="quiet" data-action="remove-appointment" data-id="${escape(c.id)}" aria-label="Remove ${escape(c.title)}">×</button></div>`).join('');
}
function renderPlan() {
  try { plan = buildPlan(state.tasks, state.commitments, state.settings, from); }
  catch (error) { notify(error, true); return; }
  const scheduled = plan.blocks.filter(b => b.kind === 'task');
  const done = state.tasks.filter(t => t.done).length;
  const date = new Date(state.settings.date + 'T12:00:00');
  $('date-display').textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('plan-summary').textContent = state.tasks.length || state.commitments.length ? `${scheduled.length} task${scheduled.length === 1 ? '' : 's'} planned · ${durationLabel(plan.taskMinutes)} of tasks${done ? ` · ${done} complete` : ''}` : 'A little structure for whatever today brings.';
  $('plan-status').textContent = plan.deferred.length ? `${plan.deferred.length} task${plan.deferred.length === 1 ? ' needs' : 's need'} another time. ${durationLabel(plan.spareMinutes)} still free between blocks.` : scheduled.length ? `${durationLabel(plan.spareMinutes)} left open. Room for life to happen.` : '';
  $('copy').disabled = !plan.blocks.length;
  if (!plan.blocks.length) {
    $('timeline').innerHTML = `<div class="empty-agenda"><svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><rect x="13" y="10" width="50" height="57" rx="10" fill="#f1edf8" stroke="#c5b6df"/><path d="M26 8v10m24-10v10M24 31h28M24 42h17M24 53h23" stroke="#9d84c2" stroke-width="3" stroke-linecap="round"/></svg><h3>${state.tasks.length && !scheduled.length ? 'Let’s make some room.' : 'Your day starts here.'}</h3><p>${state.tasks.every(t => t.done) && state.tasks.length ? 'All your tasks are complete. Enjoy the space you’ve made.' : 'Add what needs doing. We’ll find a time for it, around the things that can’t move.'}</p></div>`;
  } else {
    let cursor = Math.max(minutes(state.settings.start), plan.from);
    const rows = [];
    for (const b of plan.blocks) {
      if (b.start > cursor) rows.push(`<div class="gap-row"><span>${clock(cursor)}</span><span>${durationLabel(b.start - cursor)} open</span></div>`);
      const category = b.category || b.kind;
      rows.push(`<div class="timeline-row"><div class="time-label">${clock(b.start)}<span>${clock(b.end)}</span></div><article class="block ${category}"><div class="block-top"><div class="block-identity">${b.kind === 'task' ? `<button class="check" data-action="done" data-id="${escape(b.id)}" aria-label="Complete: ${escape(b.title)}" aria-pressed="false"></button>` : ''}<div><h3 class="block-title">${escape(b.title)}</h3>${b.kind !== 'break' ? `<p class="block-label">${b.kind === 'fixed' ? 'Fixed appointment' : `${b.category === 'work' ? 'Work' : 'Personal'} · ${{must:'High',should:'Medium',could:'Low'}[b.priority]} priority`}</p>` : ''}</div></div><span class="block-duration">${durationLabel(b.end - b.start)}</span></div>${b.reason ? `<p class="reason">${escape(b.reason)}</p>` : ''}</article></div>`);
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < minutes(state.settings.end)) rows.push(`<div class="gap-row"><span>${clock(cursor)}</span><span>${durationLabel(minutes(state.settings.end) - cursor)} open · finish by ${state.settings.end}</span></div>`);
    $('timeline').innerHTML = rows.join('');
  }
  $('overflow').hidden = !plan.deferred.length;
  $('overflow-list').innerHTML = plan.deferred.map(t => `<div class="deferred-item"><strong>${escape(t.title)} · ${durationLabel(t.duration)}</strong><p>${escape(t.reason)}</p><button class="quiet" data-action="edit" data-id="${escape(t.id)}">Adjust task</button></div>`).join('');
}
function render() { renderTasks(); renderPlan(); }
function resetTaskForm() { $('task-form').reset(); $('task-id').value = ''; $('save-task').textContent = 'Add task'; $('cancel-edit').hidden = true; }
function editTask(id) {
  const t = state.tasks.find(t => t.id === id); if (!t) return;
  $('task-id').value = id; $('task-title').value = t.title; $('task-category').value = t.category; $('task-priority').value = t.priority;
  $('task-duration').value = t.duration; $('task-earliest').value = t.earliest; $('task-deadline').value = t.deadline;
  $('save-task').textContent = 'Save changes'; $('cancel-edit').hidden = false;
  document.querySelector('.manual-entry').open = true; $('task-title').focus();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit') { editTask(id); return; }
  if (action === 'done') {
    const t = state.tasks.find(t => t.id === id);
    if (t) {
      t.done = !t.done;
      if (t.done && state.settings.date === today()) {
        const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
        from = clock(Math.max(minutes(from), now)); $('plan-from').value = from;
        notify(`Task complete. Remaining tasks replanned from ${from}.`);
      }
    }
  }
  if (action === 'delete') { state.tasks = state.tasks.filter(t => t.id !== id); if ($('task-id').value === id) resetTaskForm(); }
  if (action === 'remove-appointment') state.commitments = state.commitments.filter(c => c.id !== id);
  save(); render();
});
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(c => { c.classList.toggle('active', c === b); c.setAttribute('aria-pressed', c === b); }); renderTasks();
}));
$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const id = $('task-id').value;
    const task = { ...validateTask({ title: $('task-title').value, category: $('task-category').value, priority: $('task-priority').value, duration: Number($('task-duration').value), deadline: $('task-deadline').value, earliest: $('task-earliest').value }), id: id || uid() };
    const previous = state.tasks.find(t => t.id === id); if (previous) task.done = previous.done;
    const tasks = id ? state.tasks.map(t => t.id === id ? task : t) : [...state.tasks, task];
    buildPlan(tasks, state.commitments, state.settings, from);
    state.tasks = tasks; save(); resetTaskForm(); render(); notify(id ? 'Task updated. Your plan has been rebuilt.' : 'Task added. Your plan has been updated.'); $('task-title').focus();
  } catch (error) { notify(error, true); }
});
$('cancel-edit').addEventListener('click', resetTaskForm);
$('settings').addEventListener('submit', event => {
  event.preventDefault();
  const settings = { date: $('date').value, start: $('day-start').value, end: $('day-end').value, mode: $('mode').value, workStart: $('work-start').value, workEnd: $('work-end').value, breakMinutes: Number($('break-minutes').value) };
  try { buildPlan(state.tasks, state.commitments, settings); state.settings = settings; from = settings.start; save(); syncSettings(); render(); notify('Day updated. All incomplete tasks have been replanned from the start.'); }
  catch (error) { notify(error, true); }
});
$('mode').addEventListener('change', () => { $('work-hours').hidden = $('mode').value === 'mixed'; });
$('appointment-form').addEventListener('submit', event => {
  event.preventDefault();
  const item = { id: uid(), title: $('appointment-title').value, start: $('appointment-start').value, end: $('appointment-end').value };
  try { const items = [...state.commitments, item]; buildPlan(state.tasks, items, state.settings, from); state.commitments = items; save(); $('appointment-title').value = ''; render(); notify('Appointment added. Tasks now fit around it.'); }
  catch (error) { notify(error, true); }
});
$('notes').addEventListener('input', () => { state.notes = $('notes').value; save(); });
$('replan').addEventListener('click', () => {
  try { minutes($('plan-from').value); from = $('plan-from').value; save(); renderPlan(); notify(`Incomplete tasks replanned from ${from}. Completed tasks stay complete.`); }
  catch (error) { notify(error, true); }
});
$('now').addEventListener('click', () => {
  if (state.settings.date !== today()) { notify('Current time is only available when planning today. Set a time manually for another date.', true); return; }
  const d = new Date(); $('plan-from').value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('replan').click();
});
function download(contents, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('backup').addEventListener('click', () => { download(JSON.stringify(state, null, 2), `daylight-${state.settings.date}.json`); notify('Backup downloaded. It includes your tasks and notes.'); });
$('restore').addEventListener('change', async () => {
  try {
    const file = $('restore').files[0]; if (!file) return;
    if (file.size > 250000) throw new Error('Choose a Daylight JSON backup smaller than 250 KB.');
    const restored = validateBackup(JSON.parse(await file.text()));
    if ((state.tasks.length || state.commitments.length || state.notes) && !confirm('Replace the current plan with this backup? Export a backup first if you want to keep it.')) return;
    state = restored; from = state.from || state.settings.start; save(); syncSettings(); resetTaskForm(); clearSuggestions(); render(); notify('Backup restored.');
  } catch (error) { notify(`Could not restore: ${errorMessage(error)}`, true); }
  finally { $('restore').value = ''; }
});
document.querySelector('.file-label').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('restore').click(); } });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(planText(plan, state.settings)); notify('Plan copied.'); }
  catch { notify('Clipboard access is unavailable. Use Backup to save the complete plan instead.', true); }
});
$('sample').addEventListener('click', () => {
  if ((state.tasks.length || state.commitments.length || state.notes) && !confirm('Replace your current plan with fictional sample data? Use Backup first to keep your plan.')) return;
  state = fresh(); state.notes = '';
  state.tasks = [
    ['Finish the client proposal', 'work', 'must', 75, '12:00'],
    ['Pick up groceries', 'personal', 'should', 30, ''],
    ['Review the pull request', 'work', 'must', 45, ''],
    ['Call the dentist', 'personal', 'must', 15, '17:00'],
    ['Go for a walk', 'personal', 'should', 30, ''],
    ['Clear out the inbox', 'work', 'could', 25, ''],
    ['Sort the garage', 'personal', 'could', 480, ''],
  ].map(([title, category, priority, duration, deadline]) => ({ id: uid(), title, category, priority, duration, deadline, earliest: '', done: false }));
  state.commitments = [{ id: uid(), title: 'Team check-in', start: '10:30', end: '11:00' }, { id: uid(), title: 'Lunch, away from the desk', start: '12:30', end: '13:15' }];
  from = state.settings.start; save(); syncSettings(); resetTaskForm(); clearSuggestions(); render(); notify('Fictional sample day loaded. Scheduling works without AI; Read my notes separately uses the local model.');
});
function clearSuggestions() { suggestions = []; $('review').hidden = true; $('review-list').innerHTML = ''; }
function renderSuggestions() {
  $('review-list').innerHTML = suggestions.map((t, i) => `<div class="suggestion" data-suggestion="${i}"><label>Task<input data-field="title" value="${escape(t.title)}" maxlength="180" required></label><div class="form-grid"><label>Part of life<select data-field="category"><option value="work" ${t.category === 'work' ? 'selected' : ''}>Work</option><option value="personal" ${t.category === 'personal' ? 'selected' : ''}>Personal</option></select></label><label>Priority<select data-field="priority">${Object.entries({must:'High',should:'Medium',could:'Low'}).map(([v,l])=>`<option value="${v}" ${v===t.priority?'selected':''}>${l}</option>`).join('')}</select></label><label>Minutes<input type="number" data-field="duration" min="5" max="480" step="1" required aria-invalid="${Boolean(t.estimateWarning)}" value="${escape(t.duration)}"></label></div>${t.estimateWarning ? `<p class="estimate-warning">${escape(t.estimateWarning)}</p>` : ''}<div class="optional-times"><label>Not before<input type="text" inputmode="numeric" placeholder="HH:MM or blank" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" data-field="earliest" value="${escape(t.earliest)}"></label><label>Finish by<input type="text" inputmode="numeric" placeholder="HH:MM or blank" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" data-field="deadline" value="${escape(t.deadline)}"></label></div>${t.timeWarning ? `<p class="time-warning">${escape(t.timeWarning)}</p>` : ''}</div>`).join('');
  $('review').hidden = false;
}
async function enableLocalAI() {
  $('load-ai').disabled = true;
  $('model-progress').textContent = 'Loading local AI. Cached model files will be used when available…';
  await loadAI(text => { $('model-progress').textContent = text; });
  aiConsent = true;
  try { localStorage.setItem(AI_CONSENT_KEY, 'true'); } catch { /* This tab still remembers the choice. */ }
  $('model-progress').textContent = 'Local AI is ready. Your notes stay on your device.';
  $('ai-status').textContent = 'Local AI ready'; $('load-ai').textContent = 'Local AI enabled';
}
$('load-ai').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('read-notes').disabled = true;
  try { await enableLocalAI(); notify('Local AI is ready. Write your notes, then choose Read my notes.'); }
  catch (error) { $('model-progress').textContent = errorMessage(error); notify(error, true); }
  finally { busy = false; $('load-ai').disabled = aiReady(); $('read-notes').disabled = false; }
});
$('read-notes').addEventListener('click', async () => {
  if (busy) return;
  if (!state.notes.trim()) { notify('Write a few tasks in the notes box first.', true); $('notes').focus(); return; }
  if (!aiReady() && !aiConsent) { document.querySelector('.ai-details').open = true; notify('Enable local AI below the notes box once. The first download is several hundred MB. After that, Read my notes will load the model when needed.'); $('load-ai').focus(); return; }
  clearSuggestions();
  busy = true; $('read-notes').disabled = true; $('read-notes').textContent = 'Reading…';
  try {
    if (!aiReady()) { $('read-notes').textContent = 'Loading local AI…'; await enableLocalAI(); }
    $('read-notes').textContent = 'Reading…';
    suggestions = await extractTasks(state.notes, state.settings.date, undefined, (index, total) => { $('read-notes').textContent = `Reading task ${index} of ${total}…`; });
    renderSuggestions(); $('ai-status').textContent = 'Local AI ready';
    notify(`${suggestions.length} task${suggestions.length === 1 ? '' : 's'} ready for review. All task lines are kept. Check suggested priorities and estimates before adding.`);
    $('review-heading').scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
  catch (error) {
    $('ai-status').textContent = 'Could not read notes — see the error notice';
    if (!aiReady()) {
      $('load-ai').disabled = false; $('load-ai').textContent = 'Reload local AI';
      document.querySelector('.ai-details').open = true;
      $('model-progress').textContent = errorMessage(error);
    }
    notify(error, true);
  }
  finally { busy = false; $('read-notes').disabled = false; $('load-ai').disabled = aiReady(); $('read-notes').textContent = 'Read my notes'; }
});
$('dismiss-suggestions').addEventListener('click', clearSuggestions);
$('review-list').addEventListener('input', event => {
  if (!event.target.matches('input')) return;
  const valid = event.target.checkValidity();
  event.target.setAttribute('aria-invalid', String(!valid));
  if (event.target.dataset.field === 'duration') {
    const warning = event.target.closest('[data-suggestion]').querySelector('.estimate-warning');
    if (warning) warning.hidden = valid;
  }
  if (['earliest', 'deadline'].includes(event.target.dataset.field)) {
    const row = event.target.closest('[data-suggestion]');
    const a = row.querySelector('[data-field="earliest"]'), b = row.querySelector('[data-field="deadline"]');
    const timesValid = a.checkValidity() && b.checkValidity() && (!a.value || !b.value || minutes(a.value) < minutes(b.value));
    const warning = row.querySelector('.time-warning');
    if (warning) warning.hidden = timesValid;
  }
});
$('accept-suggestions').addEventListener('click', () => {
  const invalid = [...$('review-list').querySelectorAll('input')].find(input => !input.checkValidity());
  if (invalid) {
    invalid.reportValidity(); invalid.focus();
    notify('Check the highlighted task fields before adding. Use 5–480 whole minutes for estimates, and HH:MM or blank for times. No tasks have been added.', true);
    return;
  }
  try {
    const tasks = [...document.querySelectorAll('[data-suggestion]')].map(row => {
      const values = {}; row.querySelectorAll('[data-field]').forEach(el => { values[el.dataset.field] = el.dataset.field === 'duration' ? Number(el.value) : el.value; });
      try { return { ...validateTask(values), id: uid() }; }
      catch (error) { throw new Error(`“${values.title || 'This task'}”: ${errorMessage(error)}`); }
    });
    buildPlan([...state.tasks, ...tasks], state.commitments, state.settings, from);
    state.tasks.push(...tasks); save(); clearSuggestions(); render(); notify(`${tasks.length} reviewed tasks added. Your schedule is ready.`);
  } catch (error) { notify(error, true); }
});
syncSettings(); render();
if (aiConsent) {
  $('ai-status').textContent = 'Local AI loads when you read notes';
  $('load-ai').textContent = 'Load local AI';
}
