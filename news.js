export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=40, stale-while-revalidate=60');

  const { category } = req.query;
  const NEWS_API_KEY = process.env.NEWS_API_KEY;

  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: 'NEWS_API_KEY not configured', articles: [] });
  }

  const categoryQueries = {
    'Mundo':      'world international news',
    'Política':   'politics government election',
    'Economía':   'economy business finance market',
    'Tecnología': 'technology AI software apple google',
    'Deportes':   'sports football soccer basketball',
    'Ciencia':    'science space nasa discovery'
  };

  const reverseCategoryMap = {
    'world':       'Mundo',
    'politics':    'Política',
    'business':    'Economía',
    'technology':  'Tecnología',
    'sports':      'Deportes',
    'science':     'Ciencia'
  };

  try {
    // /v2/everything works on ALL plans including free
    const query = (category && categoryQueries[category])
      ? categoryQueries[category]
      : 'breaking news world today';

    const sources = 'bbc-news,reuters,associated-press,cnn,al-jazeera-english,the-guardian-uk';

    const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sources=${sources}&sortBy=publishedAt&pageSize=12&apiKey=${NEWS_API_KEY}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(data.message || 'NewsAPI error');
    }

    const processed = (data.articles || [])
      .filter(a => a.title && a.title !== '[Removed]' && a.urlToImage)
      .map(article => ({
        title:       article.title,
        description: article.description || '',
        content:     article.content || article.description || '',
        url:         article.url,
        urlToImage:  article.urlToImage,
        publishedAt: article.publishedAt,
        source:      article.source || { name: 'Unknown' },
        category:    detectCategory(article)
      }));

    return res.status(200).json({ articles: processed, total: processed.length });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message, articles: [] });
  }
}

function detectCategory(article) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  if (text.match(/football|soccer|nba|nfl|sport|athlete|champion|tournament|goal|match|tennis/)) return 'Deportes';
  if (text.match(/tech|iphone|android|ai|artificial intelligence|software|app|google|apple|microsoft|openai/)) return 'Tecnología';
  if (text.match(/economy|stock|market|price|inflation|bank|dollar|finance|gdp|trade/)) return 'Economía';
  if (text.match(/science|nasa|space|planet|medicine|vaccine|virus|research|discovery|climate/)) return 'Ciencia';
  if (text.match(/government|president|congress|election|senate|law|politic|minister|party|vote/)) return 'Política';
  return 'Mundo';
}
