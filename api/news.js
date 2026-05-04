export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const NEWSAPI_KEY  = process.env.NEWS_API_KEY;
  const GNEWS_KEY    = process.env.GNEWS_API_KEY;
  const CURRENTS_KEY = process.env.CURRENTS_API_KEY;

  const allArticles = [];

  // ── FUENTE 1: NewsAPI ──
  if (NEWSAPI_KEY) {
    try {
      const topics = ['world breaking news', 'politics economy crisis', 'technology science'];
      const reqs = topics.map(q =>
        fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${NEWSAPI_KEY}`)
          .then(r => r.json()).catch(() => ({ articles: [] }))
      );
      const results = await Promise.all(reqs);
      for (const r of results) {
        for (const a of (r.articles || [])) {
          if (!a.title || a.title === '[Removed]' || !a.urlToImage) continue;
          if (/^\d{2}\/\d{2}\/\d{4}/.test(a.title) || a.title.includes('five minute') || a.title.includes('bulletin')) continue;
          allArticles.push({ title:a.title, description:a.description||'', content:a.content||'', url:a.url, urlToImage:a.urlToImage, publishedAt:a.publishedAt, source:{name:a.source?.name||'NewsAPI'} });
        }
      }
    } catch(e) { console.warn('NewsAPI:', e.message); }
  }

  // ── FUENTE 2: GNews ──
  if (GNEWS_KEY) {
    try {
      const topics = ['world','business','technology','sports','science'];
      const reqs = topics.map(t =>
        fetch(`https://gnews.io/api/v4/top-headlines?topic=${t}&lang=en&max=5&apikey=${GNEWS_KEY}`)
          .then(r => r.json()).catch(() => ({ articles: [] }))
      );
      const results = await Promise.all(reqs);
      for (const r of results) {
        for (const a of (r.articles || [])) {
          if (!a.title || !a.image) continue;
          allArticles.push({ title:a.title, description:a.description||'', content:a.content||'', url:a.url, urlToImage:a.image, publishedAt:a.publishedAt, source:{name:a.source?.name||'GNews'} });
        }
      }
    } catch(e) { console.warn('GNews:', e.message); }
  }

  // ── FUENTE 3: Currents API ──
  if (CURRENTS_KEY) {
    try {
      const reqs = [
        fetch(`https://api.currentsapi.services/v1/latest-news?language=en&apiKey=${CURRENTS_KEY}`).then(r=>r.json()).catch(()=>({news:[]})),
        fetch(`https://api.currentsapi.services/v1/search?keywords=world+politics&language=en&apiKey=${CURRENTS_KEY}`).then(r=>r.json()).catch(()=>({news:[]}))
      ];
      const results = await Promise.all(reqs);
      for (const r of results) {
        for (const a of (r.news || [])) {
          if (!a.title || !a.image || a.image === 'None') continue;
          allArticles.push({ title:a.title, description:a.description||'', content:a.description||'', url:a.url, urlToImage:a.image, publishedAt:a.published, source:{name:a.author||'Currents'} });
        }
      }
    } catch(e) { console.warn('Currents:', e.message); }
  }

  // ── DEDUPLICACIÓN ──
  const unique = [];
  const seenUrls = new Set();
  const seenTitles = [];

  function normalize(str) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().split(' ').slice(0,8).join(' ');
  }
  function isSimilar(t1, t2) {
    const w1 = new Set(normalize(t1).split(' '));
    const common = normalize(t2).split(' ').filter(w => w1.has(w) && w.length > 3).length;
    return common >= 5;
  }
  for (const a of allArticles) {
    if (!a.url || seenUrls.has(a.url) || !a.title) continue;
    if (seenTitles.some(t => isSimilar(t, a.title))) continue;
    seenUrls.add(a.url);
    seenTitles.push(a.title);
    unique.push(a);
  }

  // ── RANKING DE RELEVANCIA ──
  const trusted = ['reuters','associated press','ap ','bbc','cnn','bloomberg','guardian','nytimes','washington post','al jazeera','france 24','abc news','nbc news','cbs news'];
  const impact  = ['breaking','war','killed','dead','crisis','attack','explosion','emergency','historic','record','major','summit','election','president','collapse','arrest','disaster'];
  const now = Date.now();

  const scored = unique.map(a => {
    let score = 0;
    const text = ((a.title||'')+' '+(a.description||'')).toLowerCase();
    const src  = (a.source?.name||'').toLowerCase();
    if (trusted.some(s => src.includes(s))) score += 35;
    if (a.urlToImage?.startsWith('https'))  score += 15;
    if ((a.title?.length||0) > 50)          score += 10;
    if ((a.description?.length||0) > 100)   score += 10;
    const hours = (now - new Date(a.publishedAt).getTime()) / 3600000;
    if      (hours < 2)  score += 35;
    else if (hours < 6)  score += 25;
    else if (hours < 12) score += 15;
    else if (hours < 24) score += 8;
    else                 score -= 10;
    score += impact.filter(w => text.includes(w)).length * 6;
    if (/five minute|bulletin|podcast|newsletter|subscribe/.test(text)) score -= 60;
    score += Math.random() * 4;
    return { ...a, score, category: detectCategory(a) };
  });

  scored.sort((a,b) => b.score - a.score);

  const top12 = [];
  const srcCount = {};
  for (const a of scored) {
    const src = a.source?.name || 'x';
    srcCount[src] = (srcCount[src]||0) + 1;
    if (srcCount[src] <= 3) top12.push(a);
    if (top12.length >= 12) break;
  }

  // ── TRADUCCIÓN GRATIS con MyMemory API ──
  // Sin registro, sin tarjeta — 5000 palabras/día gratis
  async function translate(text) {
    if (!text || text.length < 3) return text;
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0,500))}&langpair=en|es`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.responseStatus === 200 && d.responseData?.translatedText) {
        return d.responseData.translatedText;
      }
      return text;
    } catch(e) { return text; }
  }

  // Traducir títulos y descripciones en paralelo
  const translatePromises = top12.map(a => Promise.all([
    translate(a.title),
    translate(a.description)
  ]));

  const translated = await Promise.all(translatePromises);

  const final = top12.map((a, i) => ({
    title:         translated[i][0] || a.title,
    titleOriginal: a.title,
    description:   translated[i][1] || a.description,
    content:       a.content,
    url:           a.url,
    urlToImage:    a.urlToImage,
    publishedAt:   a.publishedAt,
    source:        a.source,
    category:      a.category,
    relevanceScore: Math.round(a.score)
  }));

  res.status(200).json({
    articles: final,
    total: final.length,
    sources: { newsapi:!!NEWSAPI_KEY, gnews:!!GNEWS_KEY, currents:!!CURRENTS_KEY, translation:'MyMemory (gratis)' }
  });
}

function detectCategory(a) {
  const t = ((a.title||'')+(a.description||'')).toLowerCase();
  if (/sport|football|soccer|nba|nfl|tennis|golf|olympic|league|championship/.test(t)) return 'Deportes';
  if (/tech|ai |apple|google|microsoft|software|iphone|robot|cyber|elon|openai/.test(t)) return 'Tecnología';
  if (/econom|stock|market|inflation|bank|dollar|trade|gdp|fed |crypto|bitcoin/.test(t)) return 'Economía';
  if (/science|nasa|space|climate|health|medicine|virus|cancer|research|discovery/.test(t)) return 'Ciencia';
  if (/politic|election|president|government|congress|senate|vote|minister|trump/.test(t)) return 'Política';
  return 'Mundo';
}
