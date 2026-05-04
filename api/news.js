export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) return res.status(500).json({ error: 'No API key', articles: [] });
  try {
    const queries = [
      'trump', 'ukraine war', 'economy inflation',
      'technology AI', 'climate change', 'election 2026'
    ];
    const q = queries[Math.floor(Math.random() * queries.length)];
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=12&language=en&apiKey=${NEWS_API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status !== 'ok') throw new Error(d.message);
    const articles = d.articles
      .filter(a => a.title && a.urlToImage && a.title !== '[Removed]')
      .map(a => ({
        title: a.title,
        description: a.description || '',
        content: a.content || '',
        url: a.url,
        urlToImage: a.urlToImage,
        publishedAt: a.publishedAt,
        source: a.source,
        category: detectCategory(a)
      }));
    res.status(200).json({ articles });
  } catch(e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
}

function detectCategory(a) {
  const t = ((a.title||'')+(a.description||'')).toLowerCase();
  if (t.match(/sport|football|soccer|nba|nfl|tennis|golf|olympic/)) return 'Deportes';
  if (t.match(/tech|ai|apple|google|microsoft|software|iphone|robot/)) return 'Tecnología';
  if (t.match(/econom|stock|market|inflation|bank|dollar|trade|gdp/)) return 'Economía';
  if (t.match(/science|nasa|space|climate|health|medicine|virus|cancer/)) return 'Ciencia';
  if (t.match(/politic|election|president|government|congress|senate|vote/)) return 'Política';
  return 'Mundo';
}
