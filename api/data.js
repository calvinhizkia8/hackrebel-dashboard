/**
 * GET /api/data
 * Returns all client data (profile + videos) from Vercel KV.
 */
import { kv } from '@vercel/kv';

const CLIENTS = [
  { id: 'elfs_active',              username: 'elfs_active',              name: 'Elfs Active',       category: 'Activewear', color: '#FE2C55' },
  { id: 'shumijapan',               username: 'shumijapan',               name: 'Shumi Japan',        category: 'Lifestyle',  color: '#7C5CFC' },
  { id: 'kamlaijakarta',            username: 'kamlaijakarta',            name: 'Kamlai Jakarta',     category: 'Fashion',    color: '#25F4EE' },
  { id: 'pieraspropolinseofficial', username: 'pieraspropolinseofficial', name: 'Pieras Propolinse',  category: 'Beauty',     color: '#FF9500' },
  { id: 'brait.idn',                username: 'brait.idn',                name: 'Brait IDN',          category: 'Lifestyle',  color: '#00D47E' },
  { id: 'm2000.outdoor',            username: 'm2000.outdoor',            name: 'M2000 Outdoor',      category: 'Outdoor',    color: '#F97316' },
  { id: 'elfs_fits',                username: 'elfs_fits',                name: 'Elfs Fits',          category: 'Fashion',    color: '#A855F7' },
  { id: 'alamsarideltamas',         username: 'alamsarideltamas',         name: 'Alam Sari Deltamas', category: 'Property',   color: '#FE2C55' },
  { id: 'alvaboard',               username: 'alvaboard',               name: 'Alva Board',         category: 'Lifestyle',  color: '#25F4EE' },
  { id: 'm2000_id',                username: 'm2000_id',                name: 'M2000 Lighter',      category: 'Lifestyle',  color: '#F97316' },
  { id: 'khana_collection1',      username: 'khana_collection1',      name: 'Khana Collection',   category: 'Fashion',    color: '#A855F7' },
];

export default async function handler(req, res) {
  // CORS — allow all origins (dashboard may be on www. or non-www)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store'); // always fresh

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  try {
    const keys    = CLIENTS.map(c => `data:${c.username}`);
    const tokenKs = CLIENTS.map(c => `token:${c.username}`);

    const [dataValues, tokenValues] = await Promise.all([
      kv.mget(...keys),
      kv.mget(...tokenKs),
    ]);

    const data     = {};
    const statuses = {};

    CLIENTS.forEach((c, i) => {
      if (dataValues[i]) {
        data[c.username] = dataValues[i];
      }
      statuses[c.username] = {
        connected:  !!tokenValues[i],
        hasData:    !!dataValues[i],
        lastSync:   dataValues[i]?.ts || null,
        connectUrl: `${process.env.DASHBOARD_URL || ''}/api/connect?account=${c.username}`,
      };
    });

    return res.status(200).json({
      data,
      statuses,
      lastSync: Date.now(),
    });

  } catch (e) {
    console.error('data.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
