/**
 * GET /api/refresh?account=username
 * Forces a fresh TikTok data fetch for a specific account and updates KV.
 * Uses the stored token — account must already be connected.
 */
import { kv } from '@vercel/kv';
import { fetchAndStoreData } from './callback.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const account = req.query.account?.trim();
  if (!account) {
    return res.status(400).json({ error: 'Missing ?account= param' });
  }

  const token = await kv.get(`token:${account}`);
  if (!token) {
    return res.status(404).json({ error: `Account @${account} is not connected` });
  }

  if (token.expires_at && token.expires_at < Date.now()) {
    return res.status(401).json({ error: `Token for @${account} has expired — please reconnect` });
  }

  try {
    const result = await fetchAndStoreData(account, token);
    return res.status(200).json({
      ok: true,
      account,
      videoCount: result.videos?.length || 0,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`refresh @${account}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
}
