export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const NEWSAPI_KEY  = process.env.NEWS_API_KEY;
  const GNEWS_KEY    = process.env.GNEWS_API_KEY;
  const CURRENTS_KEY = process.env.CURRENTS_API_KEY;

  const allArticles = [];

  // ── FUENTE 1: Noticias Dominicanas (RSS) ──
  const dominicanFeeds = [
    { url: 'https://listindiario.com/rss.xml',       name: 'Listín Diario' },
    { url: 'https://www.diariolibre.com/rss',        name: 'Diario Libre' },
    { url: 'https://www.elcaribe.com.do/feed/',      name: 'El Caribe' },
    { url: 'https://acento.com.do/feed/',            name: 'Acento' },
    { url: 'https://www.noticiassin.com/feed/',      name: 'Noticias SIN' },
    { url: 'https://eldiariony.com/feed/',           name: 'El Diario NY' },
    { url: 'https://deultimominuto.net/feed/',       name: 'De Último Minuto' },
  ];

  for (const feed of dominicanFeeds) {
    try {
      const r = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AhoraNews/1.0)' }
      });
      const xml = await r.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items.slice(0, 5)) {
        const title       = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
        const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
        const link        = (item.match(/<link>(.*?)<\/link>/) || item.match(/<guid>(.*?)<\/guid>/))?.[1] || '';
        const pubDate     = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || new Date().toISOString();
        const imgMatch    = item.match(/url="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i)
                         || item.match(/<media:content[^>]+url="([^"]+)"/i)
                         || item.match(/<enclosure[^>]+url="([^"]+)"/i);
        const img         = imgMatch?.[1] || '';
        if (!title || title.length < 10) continue;
        const cleanDesc = description.replace(/<[^>]*>/g, '').trim().slice(0, 300);
        allArticles.push({
          title, description: cleanDesc, content: cleanDesc,
          url: link, urlToImage: img,
          publishedAt: new Date(pubDate).toISOString(),
          source: { name: feed.name }, isDominican: true
        });
      }
    } catch(e) { console.warn(`RSS ${feed.name}:`, e.message); }
  }

  // ── FUENTE 2: NewsAPI ──
  if (NEWSAPI_KEY) {
    try {
      const topics = ['world breaking news', 'politics economy crisis', 'technology science'];
      const reqs = topics.map(q =>
        fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=8&language=en&apiKey=${NEWSAPI_KEY}`)
          .then(r => r.json()).catch(() => ({ articles: [] }))
      );
      const results = await Promise.all(reqs);
      for (const r of results) {
        for (const a of (r.articles || [])) {
          if (!a.title || a.title === '[Removed]' || !a.urlToImage) continue;
          if (/^\d{2}\/\d{2}\/\d{4}/.test(a.title) || /five minute|bulletin/.test(a.title)) continue;
          allArticles.push({
            title: a.title, description: a.description||'', content: a.content||'',
            url: a.url, urlToImage: a.urlToImage, publishedAt: a.publishedAt,
            source: { name: a.source?.name||'NewsAPI' }, isDominican: false
          });
        }
      }
    } catch(e) { console.warn('NewsAPI:', e.message); }
  }

  // ── FUENTE 3: GNews ──
  if (GNEWS_KEY) {
    try {
      const topics = ['world','business','technology','sports','science'];
      const reqs = topics.map(t =>
        fetch(`https://gnews.io/api/v4/top-headlines?topic=${t}&lang=en&max=4&apikey=${GNEWS_KEY}`)
          .then(r => r.json()).catch(() => ({ articles: [] }))
      );
      const results = await Promise.all(reqs);
      for (const r of results) {
        for (const a of (r.articles || [])) {
          if (!a.title || !a.image) continue;
          allArticles.push({
            title: a.title, description: a.description||'', content: a.content||'',
            url: a.url, urlToImage: a.image, publishedAt: a.publishedAt,
            source: { name: a.source?.name||'GNews' }, isDominican: false
          });
        }
      }
    } catch(e) { console.warn('GNews:', e.message); }
  }

  // ── FUENTE 4: Currents API ──
  if (CURRENTS_KEY) {
    try {
      const r = await fetch(`https://api.currentsapi.services/v1/latest-news?language=en&apiKey=${CURRENTS_KEY}`)
        .then(r=>r.json()).catch(()=>({news:[]}));
      for (const a of (r.news || [])) {
        if (!a.title || !a.image || a.image === 'None') continue;
        allArticles.push({
          title: a.title, description: a.description||'', content: a.description||'',
          url: a.url, urlToImage: a.image, publishedAt: a.published,
          source: { name: a.author||'Currents' }, isDominican: false
        });
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

  // ── RANKING ──
  const trusted = ['listín diario','listindiario','diario libre','el caribe','acento','noticias sin','de último minuto','reuters','associated press','bbc','cnn','bloomberg','guardian'];
  const impact  = ['breaking','muerto','matan','crisis','ataque','explosión','histórico','record','elecciones','presidente','colapso','arresto','desastre','guerra','killed','dead','attack','disaster'];
  const now = Date.now();

  const scored = unique.map(a => {
    let score = 0;
    const text = ((a.title||'')+' '+(a.description||'')).toLowerCase();
    const src  = (a.source?.name||'').toLowerCase();
    if (a.isDominican) score += 40;
    if (trusted.some(s => src.includes(s))) score += 30;
    if (a.urlToImage?.startsWith('https')) score += 15;
    if ((a.title?.length||0) > 40) score += 10;
    if ((a.description?.length||0) > 80) score += 10;
    const hours = (now - new Date(a.publishedAt).getTime()) / 3600000;
    if      (hours < 2)  score += 35;
    else if (hours < 6)  score += 25;
    else if (hours < 12) score += 15;
    else if (hours < 24) score += 8;
    else                 score -= 10;
    score += impact.filter(w => text.includes(w)).length * 6;
    if (/five minute|bulletin|podcast|newsletter/.test(text)) score -= 60;
    score += Math.random() * 5;
    return { ...a, score, category: detectCategory(a) };
  });

  scored.sort((a,b) => b.score - a.score);

  // Top 12 — mínimo 4 dominicanas
  const final = [];
  const srcCount = {};
  let domCount = 0;

  for (const a of scored.filter(a => a.isDominican)) {
    if (domCount >= 4) break;
    const src = a.source?.name || 'x';
    srcCount[src] = (srcCount[src]||0) + 1;
    if (srcCount[src] <= 2) { final.push(a); domCount++; }
  }
  for (const a of scored.filter(a => !a.isDominican)) {
    if (final.length >= 12) break;
    const src = a.source?.name || 'x';
    srcCount[src] = (srcCount[src]||0) + 1;
    if (srcCount[src] <= 3) final.push(a);
  }

  // ── TRADUCCIÓN gratis con MyMemory ──
  async function translate(text) {
    if (!text || text.length < 3) return text;
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0,500))}&langpair=en|es`);
      const d = await r.json();
      if (d.responseStatus === 200 && d.responseData?.translatedText) return d.responseData.translatedText;
      return text;
    } catch(e) { return text; }
  }

  const translatePromises = final.map(a =>
    a.isDominican
      ? Promise.resolve([a.title, a.description])
      : Promise.all([translate(a.title), translate(a.description)])
  );
  const translated = await Promise.all(translatePromises);

  const output = final.map((a, i) => ({
    title:          translated[i][0] || a.title,
    titleOriginal:  a.title,
    description:    translated[i][1] || a.description,
    content:        a.content,
    url:            a.url,
    urlToImage:     a.urlToImage,
    publishedAt:    a.publishedAt,
    source:         a.source,
    category:       a.category,
    isDominican:    a.isDominican,
    relevanceScore: Math.round(a.score)
  }));

  res.status(200).json({
    articles: output,
    total: output.length,
    dominican: output.filter(a=>a.isDominican).length,
    international: output.filter(a=>!a.isDominican).length
  });
}

function detectCategory(a) {
  const t = ((a.title||'')+(a.description||'')).toLowerCase();
  if (/deporte|sport|fútbol|football|béisbol|baseball|nba|nfl|liga|torneo|campeón|pelota/.test(t)) return 'Deportes';
  if (/tecnolog|tech|apple|google|microsoft|ia |inteligencia artificial|software|iphone|robot/.test(t)) return 'Tecnología';
  if (/econom|bolsa|mercado|inflaci|banco|dólar|finanz|pib|impuesto|remesa|turismo/.test(t)) return 'Economía';
  if (/ciencia|nasa|espacio|salud|medicina|vacuna|virus|investigaci|descubri|clima/.test(t)) return 'Ciencia';
  if (/polít|elecci|presidente|gobierno|congreso|senado|voto|ministro|abinader|partido/.test(t)) return 'Política';
  return 'Mundo';
}
