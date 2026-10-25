// WebLLM's worker rejects with strings, as well as ordinary Error objects.
// Always preserve a useful message when crossing that boundary.
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return fallback;
}

export function showNotice(element, value, isError = false) {
  element.textContent = errorMessage(value, isError ? 'Something went wrong. Please try again.' : 'Done.');
  element.classList.toggle('error', isError);
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.hidden = false;
}
