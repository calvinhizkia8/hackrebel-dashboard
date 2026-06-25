/**
 * GET /api/disconnect?account=alamsarideltamas
 * Removes OAuth token + cached data from Vercel KV for one account.
 */
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { account } = req.query;
  if (!account) return res.status(400).json({ error: 'Missing account param' });

  try {
    const [tokenDel, dataDel] = await Promise.all([
      kv.del('token:' + account),
      kv.del('data:' + account),
    ]);
    console.log('Disconnected @' + account);
    return res.status(200).json({ success: true, account });
  } catch (e) {
    console.error('disconnect error:', e);
    return res.status(500).json({ error: e.message });
  }
}
