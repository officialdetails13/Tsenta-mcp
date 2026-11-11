// Notifications: stored for the in-app bell, and emailed through Resend when
// RESEND_API_KEY and EMAIL_FROM are set. Email failures never break a request.
const env = (k, d) => process.env[k] ?? d;
export const emailConfigured = () => Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM'));

export function notify(db, userId, { dealId = null, kind, title, body = '', link = null }) {
  const u = db.prepare('SELECT id, email, email_notifications, deleted_at FROM users WHERE id = ?').get(userId);
  if (!u || u.deleted_at) return null;
  const { lastInsertRowid } = db.prepare('INSERT INTO notifications (user_id, deal_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, dealId, kind, title, body, link ?? (dealId ? `/deals/${dealId}` : null));
  if (emailConfigured() && u.email_notifications) sendEmail(db, Number(lastInsertRowid), u.email, title, body, link ?? (dealId ? `/deals/${dealId}` : null));
  return Number(lastInsertRowid);
}

async function sendEmail(db, id, to, subject, body, link) {
  const origin = env('PUBLIC_URL', '');
  const text = `${body}\n\n${link ? `Open in Collabo: ${origin}${link}\n\n` : ''}You can turn off email notifications in Collabo under Notifications.`;
  try {
    const res = await fetch(`${env('RESEND_BASE', 'https://api.resend.com')}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject: `Collabo: ${subject}`, text }),
    });
    if (!res.ok) throw new Error(`Resend returned ${res.status}`);
    db.prepare("UPDATE notifications SET emailed_at = datetime('now') WHERE id = ?").run(id);
  } catch (e) {
    console.error(`Email for notification ${id} failed: ${e.message}`);
  }
}
