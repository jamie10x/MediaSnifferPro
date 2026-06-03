export function EmptyState(message: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '🔍';
  const text = document.createElement('div');
  text.textContent = message;
  wrap.append(icon, text);
  return wrap;
}
