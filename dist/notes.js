import { clock, minutes } from './core.js';

export function noteLines(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 3000) throw new Error('Write between 1 and 3,000 characters of notes.');
  const lines = text.split(/\r?\n/).map(s => s.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')).filter(Boolean);
  if (lines.length > 12) throw new Error('Read up to 12 tasks at a time, with one task per line.');
  const long = lines.findIndex(line => line.length > 180);
  if (long >= 0) throw new Error(`Task ${long + 1} is too long. Keep each task line to 180 characters.`);
  if (!lines.length) throw new Error('Write at least one task, with one task per line.');
  return lines;
}

function explicitClock(value) {
  if (value.toLowerCase() === 'noon') return '12:00';
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0), suffix = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (suffix === 'pm' ? 12 : 0);
  } else if (!match[2] || hour > 23) return null; // Bare “5” is ambiguous.
  return clock(hour * 60 + minute);
}

export function explicitDetails(line) {
  const result = { earliest: '', deadline: '' };
  const category = line.match(/^\s*(work|personal)\s*:/i) || line.match(/\[(work|personal)\]/i) || line.match(/[,;]\s*(work|personal)\s*(?=[,;]|$)/i);
  if (category) result.category = category[1].toLowerCase();
  const priority = line.match(/\b(high|medium|low)\s+priority\b/i) || line.match(/\bpriority\s*:\s*(high|medium|low)\b/i);
  if (priority) result.priority = { high: 'must', medium: 'should', low: 'could' }[priority[1].toLowerCase()];
  const durations = [...line.matchAll(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)];
  if (durations.length) result.duration = durations.reduce((sum, match) => sum + Number(match[1]) * (/^h/i.test(match[2]) ? 60 : 1), 0);

  // Only source phrases can create time constraints. The model never supplies
  // these values. Unsupported time-like phrases remain visible for correction.
  const cues = /\b(not before|no earlier than|start after|start at|not after|no later than|finish by|due by|before|after|by)\s+(.+?)(?=\s+\b(?:not before|no earlier than|start after|start at|not after|no later than|finish by|due by|before|after|by)\s+|[,;]|$)/gi;
  for (const match of line.matchAll(cues)) {
    const cue = match[1].toLowerCase(), rest = match[2].trim();
    if (!/^(?:\d|noon\b|midnight\b|lunch\b|breakfast\b|dinner\b|work\b|school\b|the meeting\b)/i.test(rest)) continue;
    const key = ['not before', 'no earlier than', 'start after', 'start at', 'after'].includes(cue) ? 'earliest' : 'deadline';
    const time = rest.match(/^(noon\b|\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\d{1,2}:\d{2}(?![\d:]))/i);
    const dated = /\b(?:tomorrow|yesterday|next\s+(?:week|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d))\b|\d{4}-\d{2}-\d{2}/i.test(rest);
    const zoned = /\b(?:UTC|GMT|BST|P[SD]T|E[SD]T|CET|CEST)\b/i.test(rest);
    const parsed = !dated && !zoned && time ? explicitClock(time[1]) : null;
    // Do not guess ambiguous bare hours or convert an unsupported date to today.
    const value = parsed || rest;
    if (result[key]) {
      try {
        const a = minutes(result[key]), b = minutes(value);
        result[key] = clock(key === 'earliest' ? Math.max(a, b) : Math.min(a, b));
      } catch { result[key] = `${result[key]}; ${value}`; }
    } else result[key] = value;
  }
  return result;
}

export function groundSuggestion(line, prediction) {
  if (!prediction || typeof prediction !== 'object' || Array.isArray(prediction)) throw new Error('The model did not return task details. Please retry this note.');
  const explicit = explicitDetails(line);
  return {
    title: line,
    category: explicit.category || prediction.category,
    priority: explicit.priority || prediction.priority,
    duration: explicit.duration ?? prediction.duration,
    earliest: explicit.earliest,
    deadline: explicit.deadline,
  };
}
