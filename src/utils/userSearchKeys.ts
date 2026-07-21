/** Build searchable tokens for user directory (name / email / phone). */

export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function normalizeSearchToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namePrefixes(name: string): string[] {
  const parts = normalizeSearchToken(name).split(' ').filter(Boolean);
  const keys = new Set<string>();
  for (const part of parts) {
    keys.add(part);
    const max = Math.min(part.length, 12);
    for (let i = 1; i <= max; i++) keys.add(part.slice(0, i));
  }
  const full = parts.join(' ');
  if (full) {
    keys.add(full);
    const max = Math.min(full.length, 24);
    for (let i = 1; i <= max; i++) keys.add(full.slice(0, i));
  }
  return [...keys];
}

export function buildProfileSearchKeys(input: {
  displayName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}): string[] {
  const keys = new Set<string>();

  if (input.displayName) {
    namePrefixes(input.displayName).forEach((k) => keys.add(k));
  }

  const email = normalizeSearchToken(input.email ?? '');
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) {
      keys.add(local);
      const max = Math.min(local.length, 16);
      for (let i = 1; i <= max; i++) keys.add(local.slice(0, i));
    }
  }

  const phone = normalizePhoneDigits(input.phoneNumber);
  if (phone) {
    keys.add(phone);
    // Common IN forms: with/without country code
    if (phone.length === 10) keys.add(`91${phone}`);
    if (phone.length === 12 && phone.startsWith('91')) keys.add(phone.slice(2));
    const max = Math.min(phone.length, 12);
    for (let i = 3; i <= max; i++) keys.add(phone.slice(0, i));
  }

  return [...keys].filter((k) => k.length > 0).slice(0, 80);
}

export function queryToSearchKey(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';
  const digits = normalizePhoneDigits(trimmed);
  // Prefer phone key when query is mostly digits
  if (digits.length >= 3 && digits.length >= trimmed.replace(/[\s+\-()]/g, '').length * 0.7) {
    return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
  }
  return normalizeSearchToken(trimmed);
}
