export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) return res.status(500).json({ error: 'No API key', articles: [] });
  try {
    const url = `https://newsapi.org/v2/everything?q=world+news&sources=bbc-news,reuters,cnn,associated-press&sortBy=publishedAt&pageSize=12&apiKey=${NEWS_API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status !== 'ok') throw new Error(d.message);
    const articles = d.articles.filter(a => a.title && a.urlToImage).map(a => ({
      title: a.title, description: a.description || '',
      content: a.content || '', url: a.url,
      urlToImage: a.urlToImage, publishedAt: a.publishedAt,
      source: a.source, category: 'Mundo'
    }));
    res.status(200).json({ articles });
  } catch(e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
}
