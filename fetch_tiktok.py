#!/usr/bin/env python3
"""
Hack Rebel Social — TikTok Daily Sync Script
Dijalankan otomatis oleh GitHub Actions setiap hari jam 07.00 WIB
Fetch data semua klien TikTok dan update data.json
"""

import json
import os
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ─── CONFIG ───────────────────────────────────────────────────────────────────
DATA_JSON  = 'data.json'
PROXIES    = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/',
]
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}
TIMEOUT = 15  # seconds per request

# ─── HELPERS ──────────────────────────────────────────────────────────────────
def fetch_url(url, timeout=TIMEOUT):
    """Fetch URL with fallback proxies."""
    targets = [url] + [p + urllib.parse.quote(url, safe='') for p in PROXIES]
    for target in targets:
        try:
            req = urllib.request.Request(target, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception as e:
            print(f"  ↳ Failed {target[:60]}…: {e}")
            continue
    return None

def parse_json_from_script(html, script_id):
    pat = rf'<script\s+id="{script_id}"[^>]*>([\s\S]*?)</script>'
    m   = re.search(pat, html)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return None

def extract_profile(data, uname):
    """Try multiple known TikTok page data paths."""
    if not data:
        return None
    try:
        # Path 1: webapp.user-detail
        ud = data.get('webapp.user-detail', {}).get('userInfo', {})
        if ud:
            return build_profile(ud.get('user', {}), ud.get('stats', {}))
        # Path 2: UserPage
        ud = data.get('UserPage', {}).get('userInfo', {})
        if ud:
            return build_profile(ud.get('user', {}), ud.get('stats', {}))
        # Path 3: UserModule
        um = data.get('UserModule', {})
        if um:
            user  = (um.get('users') or {}).get(uname) or next(iter((um.get('users') or {}).values()), None)
            stats = (um.get('stats') or {}).get(uname) or next(iter((um.get('stats') or {}).values()), None)
            if user:
                return build_profile(user, stats or {})
    except Exception:
        pass
    return None

def build_profile(user, stats):
    if not user:
        return None
    return {
        'nickname':    user.get('nickname') or user.get('uniqueId', ''),
        'handle':      '@' + user.get('uniqueId', ''),
        'avatarThumb': user.get('avatarThumb') or user.get('avatarMedium') or '',
        'verified':    bool(user.get('verified')),
        'private':     bool(user.get('privateAccount')),
        'bio':         user.get('signature', ''),
        'followers':   int(stats.get('followerCount')  or user.get('followerCount')  or 0),
        'following':   int(stats.get('followingCount') or user.get('followingCount') or 0),
        'totalLikes':  int(stats.get('heartCount')     or user.get('heartCount')     or 0),
        'videoCount':  int(stats.get('videoCount')     or user.get('videoCount')     or 0),
    }

def extract_videos(data):
    sources = [
        data.get('webapp.user-detail', {}).get('itemList'),
        data.get('ItemModule'),
        (data.get('props') or {}).get('pageProps', {}).get('itemList'),
    ]
    for src in sources:
        if not src:
            continue
        arr = list(src.values()) if isinstance(src, dict) else src
        if arr:
            result = []
            for v in arr[:20]:
                s = v.get('stats', {})
                ct = v.get('createTime')
                result.append({
                    'id':         v.get('id') or v.get('itemId', ''),
                    'caption':    v.get('desc', ''),
                    'createTime': datetime.fromtimestamp(int(ct), tz=timezone.utc).isoformat() if ct else None,
                    'thumbnail':  (v.get('video') or {}).get('cover', ''),
                    'videoUrl':   (v.get('video') or {}).get('playAddr', ''),
                    'views':    int(s.get('playCount',    0)),
                    'likes':    int(s.get('diggCount',    0)),
                    'comments': int(s.get('commentCount', 0)),
                    'shares':   int(s.get('shareCount',   0)),
                })
            return [v for v in result if v['id']]
    return []

def fallback_meta(html, uname):
    fol  = re.search(r'([\d,]+)\s*(?:Followers|followers)', html)
    lik  = re.search(r'([\d,]+)\s*(?:Likes|likes)', html)
    nick = re.search(r'<title[^>]*>([^<]+)</title>', html)
    if fol or lik:
        return {
            'nickname':    nick.group(1).split('(@')[0].strip() if nick else uname,
            'handle':      '@' + uname,
            'avatarThumb': '',
            'verified':    False,
            'private':     False,
            'bio':         '',
            'followers':   int(fol.group(1).replace(',', '')) if fol else 0,
            'following':   0,
            'totalLikes':  int(lik.group(1).replace(',', '')) if lik else 0,
            'videoCount':  0,
        }
    return None

def fetch_tiktok(username):
    uname = username.lstrip('@')
    url   = f'https://www.tiktok.com/@{uname}'
    print(f'  Fetching @{uname}...')
    html = fetch_url(url)
    if not html:
        raise RuntimeError('All proxies failed')

    data    = parse_json_from_script(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__') \
           or parse_json_from_script(html, 'SIGI_STATE') \
           or parse_json_from_script(html, '__NEXT_DATA__')

    profile = extract_profile(data, uname) if data else None
    videos  = extract_videos(data)         if data else []

    if not profile:
        profile = fallback_meta(html, uname)
    if not profile:
        raise RuntimeError('Could not parse profile data')

    return profile, videos

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Hack Rebel Social — TikTok Daily Sync')

    # Load existing data.json
    with open(DATA_JSON, 'r', encoding='utf-8') as f:
        db = json.load(f)

    clients   = db.get('clients', [])
    data_dict = db.get('data', {})
    ok_count  = 0
    err_count = 0

    for client in clients:
        uname = client['username']
        print(f'\n[{ok_count + err_count + 1}/{len(clients)}] {client["name"]} (@{uname})')
        try:
            profile, videos = fetch_tiktok(uname)
            data_dict[uname] = {
                'profile': profile,
                'videos':  videos,
                'ts':      int(time.time() * 1000),
                'source':  'live',
            }
            print(f'  OK Followers: {profile["followers"]:,} | Likes: {profile["totalLikes"]:,} | Videos: {profile["videoCount"]}')
            ok_count += 1
        except Exception as e:
            print(f'  ERROR: {e}')
            # Keep existing data if available
            if uname in data_dict:
                data_dict[uname]['source'] = 'stale'
            err_count += 1

        # Polite delay between requests
        if ok_count + err_count < len(clients):
            time.sleep(2)

    # Write updated data.json
    db['data']     = data_dict
    db['lastSync'] = datetime.now(timezone.utc).isoformat()

    with open(DATA_JSON, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    print(f'\nDone — {ok_count} berhasil, {err_count} gagal')
    print(f'data.json updated: {DATA_JSON}')

    # Exit with error if ALL failed (so GitHub Actions marks it as failed)
    if ok_count == 0 and err_count > 0:
        exit(1)

if __name__ == '__main__':
    main()
