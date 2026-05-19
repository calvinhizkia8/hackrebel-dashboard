/**
 * POST /api/auth
 * Login endpoint — validates team credentials and returns a session token.
 *
 * Env vars:
 *   TEAM_USERS  =  JSON array: [{"email":"a@b.com","name":"Calvin","password":"xxx"}, ...]
 *                  OR simple comma-separated: "email:password,email2:password2"
 */
import { kv } from '@vercel/kv';
import crypto from 'crypto';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  let users = [];
  const raw = process.env.TEAM_USERS || '';
  try {
    users = JSON.parse(raw);
  } catch {
    users = raw.split(',').map(u => {
      const [e, p, n] = u.trim().split(':');
      return { email: e?.trim(), password: p?.trim(), name: n?.trim() || e?.split('@')[0] };
    }).filter(u => u.email && u.password);
  }

  const user = users.find(u =>
    u.email.toLowerCase() === email.toLowerCase().trim() &&
    u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    email: user.email,
    name: user.name || user.email.split('@')[0],
    created: Date.now(),
  };

  await kv.setex(`session:${token}`, 30 * 24 * 3600, JSON.stringify(session));

  return res.status(200).json({ token, name: session.name, email: session.email });
}
