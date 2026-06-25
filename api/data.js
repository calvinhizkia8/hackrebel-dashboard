/**
 * GET /api/data?accounts=user1,user2,...
 * Returns profile data + connection statuses for the requested accounts.
 * Also auto-includes any account that has a connected token in KV
 * (so newly connected accounts appear without needing a code change).
 *
 * CORS-enabled so the dashboard on www. or non-www can fetch it.
 */
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  try {
    const baseUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '';

    // ── 1. Usernames from dashboard (query param) ─────────────────────
    const accountsParam = req.query.accounts || '';
    const requestedUsernames = accountsParam
      ? accountsParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // ── 2. Also scan KV for any connected accounts not in the list ────
    //    This ensures newly connected accounts show up automatically.
    let connectedUsernames = [];
    try {
      const tokenKeys = await kv.keys('token:*');
      connectedUsernames = (tokenKeys || []).map(k => k.replace('token:', ''));
    } catch (e) {
      console.warn('kv.keys scan failed:', e.message);
    }

    // ── 3. Merge both lists (deduplicated) ────────────────────────────
    const allUsernames = [...new Set([...requestedUsernames, ...connectedUsernames])];

    if (!allUsernames.length) {
      return res.status(200).json({ data: {}, statuses: {}, lastSync: Date.now() });
    }

    // ── 4. Batch fetch data + tokens ──────────────────────────────────
    const dataKeys  = allUsernames.map(u => `data:${u}`);
    const tokenKeys = allUsernames.map(u => `token:${u}`);

    const [dataValues, tokenValues] = await Promise.all([
      kv.mget(...dataKeys),
      kv.mget(...tokenKeys),
    ]);

    // ── 5. Build response ─────────────────────────────────────────────
    const data     = {};
    const statuses = {};

    allUsernames.forEach((username, i) => {
      if (dataValues[i]) data[username] = dataValues[i];
      statuses[username] = {
        connected:  !!tokenValues[i],
        hasData:    !!dataValues[i],
        lastSync:   dataValues[i]?.ts || null,
        connectUrl: `${baseUrl}/api/connect?account=${encodeURIComponent(username)}`,
      };
    });

    return res.status(200).json({ data, statuses, lastSync: Date.now() });

  } catch (e) {
    console.error('data.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
