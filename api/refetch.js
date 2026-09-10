import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { account } = req.query;
  if (!account) return res.status(400).json({ error: 'Missing ?account=' });

  const token = await kv.get(`token:${account}`);
  if (!token) return res.status(404).json({ error: 'Not connected', account });

  const headers = {
    'Authorization': `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
  };

  const userRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,bio_description,avatar_url,avatar_url_100,is_verified,follower_count,following_count,likes_count,video_count',
    { headers }
  );
  const userData = await userRes.json();

  const videoRes = await fetch('https://open.tiktokapis.com/v2/video/list/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      max_count: 5,
      fields: ['id', 'title', 'cover_image_url', 'create_time', 'view_count', 'like_count', 'comment_count', 'share_count'],
    }),
  });
  const videoData = await videoRes.json();

  return res.status(200).json({
    token_scopes: token.scope,
    token_expires_at: new Date(token.expires_at).toISOString(),
    user_status: userRes.status,
    user_response: userData,
    video_status: videoRes.status,
    video_response: videoData,
  });
}
