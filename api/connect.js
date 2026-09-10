export default function handler(req, res) {
  const { account } = req.query;
  if (!account) {
    return res.status(400).json({ error: 'Missing ?account= parameter' });
  }

  const state = Buffer.from(JSON.stringify({
    account,
    ts: Date.now(),
  })).toString('base64url');

  const params = new URLSearchParams({
    client_key:    process.env.TIKTOK_APP_ID,
    scope:         'user.info.basic,user.info.stats,video.list',
    response_type: 'code',
    redirect_uri:  process.env.TIKTOK_REDIRECT_URI,
    state,
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  res.redirect(302, authUrl);
}
