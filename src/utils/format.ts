export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(ms: number, pattern: 'short' | 'full' = 'short'): string {
  const d = new Date(ms);
  if (pattern === 'full') {
    return d.toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function currentMonthYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour <= 11) return 'Good morning';
  if (hour <= 16) return 'Good afternoon';
  return 'Good evening';
}

export function parseJsonToMap(json: string): Record<string, number> {
  if (!json || json === '{}') return {};
  const map: Record<string, number> = {};
  try {
    const content = json.trim().replace(/^\{|\}$/g, '');
    if (!content) return {};
    for (const pair of content.split(',')) {
      const parts = pair.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim().replace(/^"|"$/g, '');
        const value = parseFloat(parts[parts.length - 1].trim());
        if (!isNaN(value)) map[key] = value;
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}
