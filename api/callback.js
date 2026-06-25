/**
 * GET /api/callback?code=...&state=...
 * TikTok redirects here after user authorizes.
 */
import { kv } from '@vercel/kv';

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(htmlPage('❌ Gagal Connect', `
      <p>TikTok menolak permintaan: <strong>${error}</strong></p>
      <p>${error_description || ''}</p>
      <a href="${process.env.DASHBOARD_URL}">← Kembali ke Dashboard</a>
    `));
  }

  let account;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    account = decoded.account;
    if (!account) throw new Error('No account in state');
    if (Date.now() - decoded.ts > 10 * 60 * 1000) throw new Error('State expired');
  } catch (e) {
    return res.status(400).send(htmlPage('❌ Error', `<p>State tidak valid: ${e.message}</p>`));
  }

  let tokenData;
  try {
    const body = new URLSearchParams({
      client_key:    process.env.TIKTOK_APP_ID,
      client_secret: process.env.TIKTOK_APP_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  process.env.TIKTOK_REDIRECT_URI,
    });
    const r = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    tokenData = await r.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);
  } catch (e) {
    return res.status(500).send(htmlPage('❌ Token Error', `<p>${e.message}</p>`));
  }

  const tokenRecord = {
    open_id:            tokenData.open_id,
    access_token:       tokenData.access_token,
    refresh_token:      tokenData.refresh_token,
    scope:              tokenData.scope,
    expires_at:         Date.now() + (tokenData.expires_in * 1000),
    refresh_expires_at: Date.now() + (tokenData.refresh_expires_in * 1000),
    connected_at:       new Date().toISOString(),
    account,
  };
  await kv.set(`token:${account}`, tokenRecord);

  // Fetch initial data
  let fetchError = null;
  try {
    await fetchAndStoreData(account, tokenRecord);
  } catch (e) {
    fetchError = e.message;
    console.error('Initial fetch failed for', account, ':', e.message);
  }

  return res.status(200).send(htmlPage('✅ Berhasil!', `
    <p>Akun <strong>@${account}</strong> berhasil terhubung!</p>
    ${fetchError ? `<p style="color:#FF9500;font-size:12px">⚠️ Data fetch: ${fetchError}</p>` : '<p>Data TikTok sudah tersimpan.</p>'}
    <br/>
    <a href="${process.env.DASHBOARD_URL}" style="
      display:inline-block;background:#FE2C55;color:#fff;
      padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700
    ">Lihat Dashboard →</a>
  `));
}

export async function fetchAndStoreData(account, token) {
  const authHeader = `Bearer ${token.access_token}`;

  // ── User info ──────────────────────────────────────────────────────────────
  const userRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,bio_description,avatar_url,avatar_url_100,is_verified,follower_count,following_count,likes_count,video_count',
    { headers: { 'Authorization': authHeader } }
  );
  const userData = await userRes.json();

  if (userData.error?.code && userData.error.code !== 'ok') {
    throw new Error(`User info API error: ${userData.error.code} - ${userData.error.message}`);
  }

  const u = userData?.data?.user || {};
  console.log(`[@${account}] user API status:${userRes.status} display_name:${u.display_name} followers:${u.follower_count}`);

  const profile = {
    nickname:    u.display_name    || account,
    handle:      '@' + account,
    avatarThumb: u.avatar_url_100  || u.avatar_url || '',
    verified:    !!u.is_verified,
    private:     false,
    bio:         u.bio_description || '',
    followers:   u.follower_count  || 0,
    following:   u.following_count || 0,
    totalLikes:  u.likes_count     || 0,
    videoCount:  u.video_count     || 0,
  };

  // ── Video list ─────────────────────────────────────────────────────────────
  const videoRes = await fetch('https://open.tiktokapis.com/v2/video/list/', {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_count: 20,
      fields: ['id','title','cover_image_url','create_time','share_url',
               'view_count','like_count','comment_count','share_count'],
    }),
  });
  const videoData = await videoRes.json();

  if (videoData.error?.code && videoData.error.code !== 'ok') {
    throw new Error(`Video list API error: ${videoData.error.code} - ${videoData.error.message}`);
  }

  const rawVideos = videoData?.data?.videos || [];
  console.log(`[@${account}] video API status:${videoRes.status} count:${rawVideos.length}`);

  const videos = rawVideos.map(v => ({
    id:         v.id,
    caption:    v.title || '',
    createTime: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    thumbnail:  v.cover_image_url || '',
    videoUrl:   v.share_url || '',
    views:      v.view_count    || 0,
    likes:      v.like_count    || 0,
    comments:   v.comment_count || 0,
    shares:     v.share_count   || 0,
  }));

  await kv.set(`data:${account}`, {
    profile,
    videos,
    ts:     Date.now(),
    source: 'api',
  });

  return { profile, videos };
}

function htmlPage(title, body) {
  return `<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${title} — Hack Rebel Social</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
        background:#000;color:#fff;display:flex;align-items:center;
        justify-content:center;min-height:100vh;padding:24px}
      .card{background:#111;border:1px solid #222;border-radius:16px;
        padding:32px;max-width:420px;width:100%;text-align:center}
      h1{font-size:22px;font-weight:800;margin-bottom:12px}
      p{font-size:14px;color:#999;line-height:1.6;margin-bottom:6px}
      a{color:#25F4EE}
    </style>
  </head><body><div class="card">
    <h1>${title}</h1>${body}
  </div></body></html>`;
}
