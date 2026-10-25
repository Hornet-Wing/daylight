export const PRIORITIES = { must: 0, should: 1, could: 2 };
export function minutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Enter a valid time in HH:MM format.');
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function clock(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
export function durationLabel(n) { return n < 60 ? `${n}m` : `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ''}`; }
export function validateTask(task) {
  if (!task || typeof task !== 'object') throw new Error('Invalid task.');
  if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 180) throw new Error('Give each task a title of 1–180 characters.');
  if (!['work', 'personal'].includes(task.category)) throw new Error('Choose work or personal for each task.');
  if (!(Object.hasOwn(PRIORITIES, task.priority))) throw new Error('Choose a valid priority.');
  if (!Number.isInteger(task.duration) || task.duration < 5 || task.duration > 480) throw new Error('Task estimates must be 5–480 whole minutes.');
  for (const key of ['deadline', 'earliest']) if (task[key]) minutes(task[key]);
  if (task.earliest && task.deadline && minutes(task.earliest) >= minutes(task.deadline)) throw new Error('A task’s earliest start must come before its deadline.');
  return { title: task.title.trim(), category: task.category, priority: task.priority, duration: task.duration, deadline: task.deadline || '', earliest: task.earliest || '', done: task.done === true };
}
export function validateSettings(settings) {
  if (!settings || !/^\d{4}-\d{2}-\d{2}$/.test(settings.date || '') || Number.isNaN(Date.parse(settings.date)) || new Date(settings.date).toISOString().slice(0, 10) !== settings.date) throw new Error('Choose a valid planning date.');
  const start = minutes(settings.start), end = minutes(settings.end);
  if (end <= start) throw new Error('Your day must end after it starts. Overnight plans are not supported.');
  if (!['mixed', 'separate'].includes(settings.mode)) throw new Error('Choose how to mix work and personal tasks.');
  if (minutes(settings.workStart) >= minutes(settings.workEnd)) throw new Error('Work hours must end after they start.');
  if (![0, 5, 10, 15].includes(settings.breakMinutes)) throw new Error('Choose a supported break length.');
  return { ...settings, startMinute: start, endMinute: end };
}
export function validateCommitments(commitments, start, end) {
  if (!Array.isArray(commitments) || commitments.length > 60) throw new Error('Use up to 60 appointments.');
  const fixed = commitments.map(c => {
    if (!c || typeof c.title !== 'string' || !c.title.trim() || c.title.length > 180) throw new Error('Give each appointment a title of 1–180 characters.');
    const a = minutes(c.start), b = minutes(c.end);
    if (b <= a || a < start || b > end) throw new Error(`“${c.title}” must fit inside your day, with its end after its start.`);
    return { id: c.id, title: c.title.trim(), start: a, end: b, kind: 'fixed' };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < fixed.length; i++) if (fixed[i].start < fixed[i - 1].end) throw new Error(`“${fixed[i - 1].title}” and “${fixed[i].title}” overlap. Adjust their times.`);
  return fixed;
}
function subtract(windows, start, end) {
  return windows.flatMap(([a, b]) => end <= a || start >= b ? [[a, b]] : [[a, Math.max(a, start)], [Math.min(b, end), b]].filter(([x, y]) => y > x));
}
export function buildPlan(tasks, commitments, settings, from = settings.start) {
  const s = validateSettings(settings);
  if (!Array.isArray(tasks) || tasks.length > 100) throw new Error('Use up to 100 tasks per day.');
  const ids = new Set();
  const clean = tasks.map((t, index) => {
    if (typeof t.id !== 'string' || !t.id || ids.has(t.id)) throw new Error('Each task needs a unique ID.');
    ids.add(t.id); return { ...validateTask(t), id: t.id, index };
  });
  const fixed = validateCommitments(commitments, s.startMinute, s.endMinute);
  const lower = Math.max(s.startMinute, minutes(from));
  let windows = lower < s.endMinute ? [[lower, s.endMinute]] : [];
  for (const c of fixed) windows = subtract(windows, c.start, c.end);
  const capacity = windows.reduce((sum, [a, b]) => sum + b - a, 0);
  const blocks = [...fixed], deferred = [];
  const pending = clean.filter(t => !t.done).sort((a, b) => PRIORITIES[a.priority] - PRIORITIES[b.priority] || (a.deadline ? minutes(a.deadline) : 1440) - (b.deadline ? minutes(b.deadline) : 1440) || a.index - b.index);
  for (const t of pending) {
    const earliest = Math.max(lower, t.earliest ? minutes(t.earliest) : lower);
    const latest = Math.min(s.endMinute, t.deadline ? minutes(t.deadline) : s.endMinute);
    let allowed = [[earliest, latest]];
    if (s.mode === 'separate') {
      const ws = minutes(s.workStart), we = minutes(s.workEnd);
      allowed = t.category === 'work' ? [[Math.max(earliest, ws), Math.min(latest, we)]] : [[earliest, Math.min(latest, ws)], [Math.max(earliest, we), latest]];
    }
    let slot;
    for (const [a, b] of windows) {
      for (const [c, d] of allowed) {
        const at = Math.max(a, c), until = Math.min(b, d);
        if (at + t.duration <= until) { slot = [at, at + t.duration, b]; break; }
      }
      if (slot) break;
    }
    if (!slot) {
      deferred.push({ ...t, reason: t.deadline ? `No ${durationLabel(t.duration)} slot before ${t.deadline}. Try a shorter estimate or change the deadline.` : `No uninterrupted ${durationLabel(t.duration)} slot in the allowed hours. Shorten the task or move it to another day.` });
      continue;
    }
    const [start, end, windowEnd] = slot;
    const reason = `${({must:'High',should:'Medium',could:'Low'})[t.priority]} priority${t.deadline ? `, due by ${t.deadline}` : ''}${s.mode === 'mixed' ? '; work and personal share the day.' : `; fits your ${t.category} hours.`}`;
    blocks.push({ ...t, start, end, kind: 'task', reason });
    windows = subtract(windows, start, end);
    if (s.breakMinutes && windowEnd > end) {
      const breakEnd = Math.min(end + s.breakMinutes, windowEnd);
      blocks.push({ id: `break-${t.id}`, title: 'Take a breather', start: end, end: breakEnd, kind: 'break' });
      windows = subtract(windows, end, breakEnd);
    }
  }
  blocks.sort((a, b) => a.start - b.start);
  const taskMinutes = blocks.filter(b => b.kind === 'task').reduce((n, b) => n + b.end - b.start, 0);
  return { blocks, deferred, capacity, taskMinutes, from: lower, spareMinutes: windows.reduce((n, [a, b]) => n + b - a, 0) };
}
export function validateExtraction(raw) {
  if (!raw || !Array.isArray(raw.tasks) || !raw.tasks.length || raw.tasks.length > 12) throw new Error('The AI must return between 1 and 12 tasks. Try a shorter note.');
  return raw.tasks.map(t => validateTask({ ...t, done: false }));
}
export function extractionForReview(raw) {
  // Validate shape and labels independently of estimates and optional times.
  // Temporary values are only for validation; preserve model values for review.
  const clean = validateExtraction({ ...raw, tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(t => ({ ...t, duration: 30, earliest: '', deadline: '' })) : raw?.tasks });
  return clean.map((task, i) => {
    const original = raw.tasks[i], estimate = original.duration;
    const valid = Number.isInteger(estimate) && estimate >= 5 && estimate <= 480;
    const times = {}, warnings = [];
    for (const [key, label] of [['earliest', 'Not before'], ['deadline', 'Finish by']]) {
      times[key] = original[key] == null ? '' : String(original[key]);
      if (times[key]) {
        try { minutes(times[key]); }
        catch { warnings.push(`${label}: the AI suggested “${times[key]}”. Enter HH:MM or leave it blank if no time is needed.`); }
      }
    }
    if (!warnings.length && times.earliest && times.deadline && minutes(times.earliest) >= minutes(times.deadline)) warnings.push('Not before must be earlier than Finish by. Check the suggested times.');
    return {
      ...task,
      ...times,
      duration: typeof estimate === 'number' && Number.isFinite(estimate) ? estimate : '',
      estimateWarning: valid ? '' : `Check the estimate: the AI suggested ${typeof estimate === 'number' && Number.isFinite(estimate) ? `${estimate} minutes` : 'no usable duration'}. Enter 5–480 whole minutes before adding.`,
      timeWarning: warnings.join(' '),
    };
  });
}
export function validateBackup(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.tasks) || !Array.isArray(raw.commitments)) throw new Error('Choose a Daylight backup file.');
  buildPlan(raw.tasks, raw.commitments, raw.settings);
  if (raw.from) minutes(raw.from);
  return { version: 1, settings: raw.settings, from: raw.from || raw.settings.start, tasks: raw.tasks.map(t => ({ ...validateTask(t), id: t.id })), commitments: raw.commitments.map(c => ({ id: crypto.randomUUID(), title: c.title, start: c.start, end: c.end })), notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 3000) : '' };
}
export function planText(plan, settings) {
  return [`Daylight · ${settings.date}`, ...plan.blocks.map(b => `${clock(b.start)}–${clock(b.end)}  ${b.title}${b.category ? ` (${b.category})` : ''}`), ...(plan.deferred.length ? ['', 'For another time', ...plan.deferred.map(t => `- ${t.title} (${durationLabel(t.duration)}) — ${t.reason}`)] : [])].join('\n');
}
