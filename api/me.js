import { kv } from '@vercel/kv';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });

  const raw = await kv.get(`session:${token}`);
  if (!raw) return res.status(401).json({ error: 'Session expired or invalid' });

  const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
  await kv.expire(`session:${token}`, 30 * 24 * 3600);

  return res.status(200).json({ ok: true, name: session.name, email: session.email });
}
