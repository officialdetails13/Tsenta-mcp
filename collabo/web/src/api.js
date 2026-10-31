let token = localStorage.getItem('collabo_token');

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('collabo_token', t);
  else localStorage.removeItem('collabo_token');
}
export const hasToken = () => !!token;

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const money = (cents, opts = {}) =>
  cents == null ? '—' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: opts.exact ? 2 : 0 });

export const compact = (n) => (n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n));

export const qs = (obj) => {
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
