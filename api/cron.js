/**
 * GET /api/cron
 * Called by Vercel Cron every day at 07:00 WIB (00:00 UTC).
 * Refreshes TikTok tokens + re-fetches all account data.
 * Protected by CRON_SECRET env var.
 */
import { kv } from '@vercel/kv';
import { fetchAndStoreData } from './callback.js';

const TOKEN_URL    = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERNAMES = [
  'elfs_active', 'shumijapan', 'kamlaijakarta', 'pieraspropolinseofficial',
  'brait.idn', 'm2000.outdoor', 'elfs_fits', 'alamsarideltamas',
];

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { ok: [], failed: [], skipped: [] };
  const start   = Date.now();

  for (const username of USERNAMES) {
    const token = await kv.get(`token:${username}`);

    if (!token) {
      results.skipped.push(username);
      console.log(`SKIP ${username}: not connected yet`);
      continue;
    }

    try {
      let activeToken = token;
      if (token.expires_at - Date.now() < 60 * 60 * 1000) {
        console.log(`Refreshing token for @${username}`);
        activeToken = await refreshToken(username, token);
      }

      console.log(`Fetching @${username}`);
      await fetchAndStoreData(username, activeToken);
      results.ok.push(username);
      console.log(`OK @${username} done`);
    } catch (e) {
      results.failed.push({ username, error: e.message });
      console.error(`ERR @${username}: ${e.message}`);
    }

    await sleep(1000);
  }

  const summary = {
    duration: `${((Date.now() - start) / 1000).toFixed(1)}s`,
    ok:       results.ok.length,
    failed:   results.failed.length,
    skipped:  results.skipped.length,
    details:  results,
    syncedAt: new Date().toISOString(),
  };

  console.log('Cron done:', JSON.stringify(summary));
  return res.status(200).json(summary);
}

async function refreshToken(username, token) {
  const body = new URLSearchParams({
    client_key:    process.env.TIKTOK_APP_ID,
    client_secret: process.env.TIKTOK_APP_SECRET,
    grant_type:    'refresh_token',
    refresh_token: token.refresh_token,
  });

  const r = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const updated = {
    ...token,
    access_token:       data.access_token,
    refresh_token:      data.refresh_token || token.refresh_token,
    expires_at:         Date.now() + (data.expires_in * 1000),
    refresh_expires_at: Date.now() + ((data.refresh_expires_in || 86400 * 30) * 1000),
  };
  await kv.set(`token:${username}`, updated);
  return updated;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
