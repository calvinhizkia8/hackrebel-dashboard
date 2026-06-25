/**
 * GET  /api/clients         → returns saved client list from KV
 * POST /api/clients         → saves client list to KV
 *
 * This lets the dashboard persist its client list server-side,
 * so any browser/device sees the same accounts.
 */
import { kv } from '@vercel/kv';

const CLIENTS_KEY = 'dashboard:clients';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: return current client list ──────────────────────────────
  if (req.method === 'GET') {
    const clients = await kv.get(CLIENTS_KEY);
    return res.status(200).json({ clients: clients || [] });
  }

  // ── POST: save client list ────────────────────────────────────────
  if (req.method === 'POST') {
    const { clients } = req.body || {};
    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: '`clients` must be an array' });
    }
    await kv.set(CLIENTS_KEY, clients);
    return res.status(200).json({ ok: true, count: clients.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
