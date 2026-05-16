export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=40, stale-while-revalidate=60');

  const { category } = req.query;

  // Dominican Republic RSS feeds - images always match their stories
  const RSS_FEEDS = [
    'https://www.listindiario.com/rss/portada.xml',
    'https://noticiassin.com/feed/',
    'https://www.diariolibre.com/rss/portada.xml',
    'https://www.elcaribe.com.do/feed/',
    'https://almomento.net/feed/',
    'https://acento.com.do/feed/'
  ];

  try {
    // Fetch all RSS feeds in parallel
    const results = await Promise.allSettled(
      RSS_FEEDS.map(url => 
        fetch(url, { 
          headers: { 'User-Agent': 'AhoraNews/1.0' },
          signal: AbortSignal.timeout(5000)
        })
        .then(r => r.text())
        .then(xml => parseRSS(xml))
        .catch(() => [])
      )
    );

    // Merge all articles
    let allArticles = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.length) {
        allArticles = allArticles.concat(r.value);
      }
    });

    // Deduplicate by title and image
    const seenTitles = new Set();
    const seenImgs = new Set();
    allArticles = allArticles.filter(a => {
      if (!a.title || !a.urlToImage) return false;
      if (seenTitles.has(a.title)) return false;
      if (seenImgs.has(a.urlToImage)) return false;
      seenTitles.add(a.title);
      seenImgs.add(a.urlToImage);
      return true;
    });

    // Filter by category if requested
    if (category) {
      allArticles = allArticles.filter(a => detectCategory(a) === category);
    }

    // Sort by date - newest first
    allArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Take top 12
    const top = allArticles.slice(0, 12);

    // Map to our format
    const processed = top.map(article => ({
      title:          article.title,
      description:    article.description || '',
      content:        article.content || article.description || '',
      body:           article.content || article.description || '',
      url:            article.url,
      urlToImage:     article.urlToImage,
      publishedAt:    article.publishedAt,
      source:         { name: 'AhoraNews' },
      category:       detectCategory(article),
      isViral:        false,
      originalSource: article.source || 'Unknown',
      needsRewrite:   true
    }));

    return res.status(200).json({ articles: processed, total: processed.length });

  } catch (error) {
    console.error('RSS Error:', error.message);
    return res.status(500).json({ error: error.message, articles: [] });
  }
}

// ── PARSE RSS XML ──
function parseRSS(xml) {
  const articles = [];
  try {
    // Extract items
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    items.forEach(item => {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link') || extractTag(item, 'guid');
      const description = extractTag(item, 'description');
      const pubDate = extractTag(item, 'pubDate');
      const source = extractTag(item, 'source') || '';
      
      // Extract image - try multiple methods
      let img = '';
      // Method 1: media:content
      const mediaMatch = item.match(/media:content[^>]*url="([^"]+)"/);
      if (mediaMatch) img = mediaMatch[1];
      // Method 2: enclosure
      if (!img) {
        const encMatch = item.match(/enclosure[^>]*url="([^"]+)"/);
        if (encMatch) img = encMatch[1];
      }
      // Method 3: og:image in description
      if (!img) {
        const ogMatch = description && description.match(/src="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
        if (ogMatch) img = ogMatch[1];
      }

      if (title && link && img) {
        articles.push({
          title: cleanText(title),
          description: cleanText(description || '').slice(0, 200),
          content: cleanText(description || ''),
          url: link,
          urlToImage: img,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          source: source
        });
      }
    });
  } catch(e) {}
  return articles;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'));
  return match ? (match[1] || match[2] || '').trim() : '';
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function detectCategory(article) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  if (text.match(/futbol|soccer|nba|nfl|beisbol|baseball|mlb|deporte|atletismo|campeonato|torneo|jugador|partido/)) return 'Deportes';
  if (text.match(/tech|iphone|android|ia|inteligencia artificial|software|app|google|apple|microsoft/)) return 'Tecnología';
  if (text.match(/economia|bolsa|mercado|precio|inflacion|banco|dolar|peso|finanza|impuesto/)) return 'Economía';
  if (text.match(/ciencia|nasa|espacio|planeta|medicina|vacuna|virus|investigacion|descubrimiento|clima/)) return 'Ciencia';
  if (text.match(/gobierno|presidente|congreso|eleccion|senado|ley|politica|ministro|partido|abinader/)) return 'Política';
  if (text.match(/nacional|dominicana|dominicano|santo domingo|santiago|haiti|rd |republica/)) return 'Nacionales';
  return 'Mundo';
}
