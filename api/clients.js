import { kv } from '@vercel/kv';

const CLIENTS_KEY = 'dashboard:clients';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const clients = await kv.get(CLIENTS_KEY);
    return res.status(200).json({ clients: clients || [] });
  }

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
