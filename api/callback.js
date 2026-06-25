/**
 * GET /api/callback?code=...&state=...
 * TikTok redirects here after user authorizes.
 * Exchanges auth code for access_token and stores it in Vercel KV.
 */
import { kv } from '@vercel/kv';

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  // ── User denied ──────────────────────────────────────────────────
  if (error) {
    return res.status(400).send(htmlPage('❌ Gagal Connect', `
      <p>TikTok menolak permintaan: <strong>${error}</strong></p>
      <p>${error_description || ''}</p>
      <a href="${process.env.DASHBOARD_URL}">← Kembali ke Dashboard</a>
    `));
  }

  // ── Decode state ──────────────────────────────────────────────────
  let account;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    account = decoded.account;
    if (!account) throw new Error('No account in state');
    // Reject stale states (>10 min)
    if (Date.now() - decoded.ts > 10 * 60 * 1000) throw new Error('State expired');
  } catch (e) {
    return res.status(400).send(htmlPage('❌ Error', `<p>State tidak valid: ${e.message}</p>`));
  }

  // ── Exchange code for tokens ─────────────────────────────────────
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

  // ── Store tokens in KV ───────────────────────────────────────────
  const tokenRecord = {
    open_id:       tokenData.open_id,
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    scope:         tokenData.scope,
    expires_at:    Date.now() + (tokenData.expires_in * 1000),
    refresh_expires_at: Date.now() + (tokenData.refresh_expires_in * 1000),
    connected_at:  new Date().toISOString(),
    account,
  };

  await kv.set(`token:${account}`, tokenRecord);

  // Also fetch initial data immediately
  try {
    await fetchAndStoreData(account, tokenRecord);
  } catch (e) {
    console.error('Initial fetch failed:', e.message);
  }

  // ── Show success page ────────────────────────────────────────────
  return res.status(200).send(htmlPage('✅ Berhasil!', `
    <p>Akun <strong>@${account}</strong> berhasil terhubung ke dashboard!</p>
    <p>Data TikTok sudah bisa ditampilkan.</p>
    <br/>
    <a href="${process.env.DASHBOARD_URL}" style="
      display:inline-block;background:#FE2C55;color:#fff;
      padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700
    ">Lihat Dashboard →</a>
    <p style="margin-top:16px;font-size:12px;color:#888">
      Halaman ini bisa ditutup.
    </p>
  `));
}

// ── Fetch profile + videos and cache in KV ───────────────────────────────────
async function fetchAndStoreData(account, token) {
  const headers = {
    'Authorization': `Bearer ${token.access_token}`,
    'Content-Type':  'application/json',
  };

  // User info
  const userRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=display_name,bio_description,avatar_url,is_verified,follower_count,following_count,likes_count,video_count',
    { headers }
  );
  const userData = await userRes.json();
  const u = userData?.data?.user || {};

  const profile = {
    nickname:    u.display_name   || account,
    handle:      '@' + account,
    avatarThumb: u.avatar_url     || '',
    verified:    !!u.is_verified,
    private:     false,
    bio:         u.bio_description || '',
    followers:   u.follower_count  || 0,
    following:   u.following_count || 0,
    totalLikes:  u.likes_count     || 0,
    videoCount:  u.video_count     || 0,
  };

  // Video list — paginate up to 3 pages (max 60 videos)
  // NOTE: TikTok v2 requires `fields` as URL query param, NOT in JSON body
  const VIDEO_FIELDS = 'id,title,cover_image_url,create_time,share_url,view_count,like_count,comment_count,share_count';
  const VIDEO_URL = `https://open.tiktokapis.com/v2/video/list/?fields=${VIDEO_FIELDS}`;
  const rawVideos = [];
  let cursor = null;
  let hasMore = true;
  let page = 0;
  while (hasMore && page < 5) {
    const body = { max_count: 20 };
    if (cursor !== null) body.cursor = cursor;
    const videoRes = await fetch(VIDEO_URL, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const videoData = await videoRes.json();
    const batch = videoData?.data?.videos || [];
    rawVideos.push(...batch);
    hasMore = !!videoData?.data?.has_more;
    cursor = videoData?.data?.cursor ?? null;
    page++;
    if (batch.length < 20) break; // last page
  }

  // Filter out live invite clips + private/unpublished videos
  // Live invite clips have <10 views and are hidden by TikTok on public profile
  const videos = rawVideos
    .filter(v => (v.view_count || 0) >= 10)
    .map(v => ({
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

// Export for use in cron.js
export { fetchAndStoreData };

// ── Simple HTML wrapper ───────────────────────────────────────────────────────
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
