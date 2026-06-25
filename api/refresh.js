/**
 * GET /api/refresh?account=username
 * Forces a fresh TikTok data fetch and returns debug info about API responses.
 */
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const account = req.query.account?.trim();
  if (!account) return res.status(400).json({ error: 'Missing ?account= param' });

  const token = await kv.get(`token:${account}`);
  if (!token) return res.status(404).json({ error: `@${account} not connected` });

  const headers = {
    'Authorization': `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
  };

  // Test user info
  const userRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,video_count',
    { headers }
  );
  const userData = await userRes.json();

  // Test video list (page 1 only)
  const videoRes = await fetch('https://open.tiktokapis.com/v2/video/list/', {
    method: 'POST', headers,
    body: JSON.stringify({
      max_count: 20,
      fields: ['id','title','create_time','view_count','like_count'],
    }),
  });
  const videoData = await videoRes.json();

  return res.status(200).json({
    account,
    tokenExpiresAt: new Date(token.expires_at).toISOString(),
    tokenExpired: token.expires_at < Date.now(),
    scope: token.scope,
    userApiStatus: userRes.status,
    userError: userData?.error,
    userDisplay: userData?.data?.user?.display_name,
    videoApiStatus: videoRes.status,
    videoError: videoData?.error,
    videoData: videoData?.data,
    videosReturned: videoData?.data?.videos?.length ?? 0,
  });
}
