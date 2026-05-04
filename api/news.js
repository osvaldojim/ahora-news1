export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) return res.status(500).json({ error: 'No API key', articles: [] });

  try {
    // Buscamos noticias de múltiples temas importantes
    const topics = [
      'breaking news world',
      'trump politics economy',
      'war conflict crisis',
      'technology AI innovation',
      'climate energy environment'
    ];

    // Hacemos varias búsquedas en paralelo
    const requests = topics.map(q =>
      fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${NEWS_API_KEY}`)
        .then(r => r.json())
        .catch(() => ({ articles: [] }))
    );

    const results = await Promise.all(requests);

    // Juntamos todos los artículos
    const allArticles = [];
    const seen = new Set();
    for (const result of results) {
      for (const a of (result.articles || [])) {
        if (!a.title || a.title === '[Removed]' || !a.urlToImage) continue;
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        allArticles.push(a);
      }
    }

    // RANKING DE RELEVANCIA — le damos puntos a cada noticia
    const topSources = ['reuters', 'associated-press', 'bbc-news', 'cnn', 'the-guardian-uk', 'bloomberg', 'ap', 'nytimes'];
    const importantWords = ['breaking', 'war', 'crisis', 'emergency', 'killed', 'attack', 'major', 'historic', 'first', 'record', 'dead', 'collapse', 'explosion', 'summit', 'election', 'president'];
    const now = Date.now();

    const scored = allArticles.map(a => {
      let score = 0;
      const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
      const sourceId = (a.source?.id || '').toLowerCase();
      const sourceName = (a.source?.name || '').toLowerCase();

      // Fuente reconocida = más confiable
      if (topSources.some(s => sourceId.includes(s) || sourceName.includes(s))) score += 30;

      // Tiene imagen de calidad
      if (a.urlToImage && a.urlToImage.startsWith('https')) score += 20;

      // Título descriptivo (no muy corto)
      if (a.title && a.title.length > 40) score += 10;

      // Descripción completa
      if (a.description && a.description.length > 80) score += 10;

      // Frescura — noticias recientes valen más
      const age = now - new Date(a.publishedAt).getTime();
      const hours = age / (1000 * 60 * 60);
      if (hours < 3)  score += 30;
      else if (hours < 6)  score += 25;
      else if (hours < 12) score += 15;
      else if (hours < 24) score += 8;

      // Palabras clave de alto impacto
      const matches = importantWords.filter(w => text.includes(w)).length;
      score += matches * 8;

      // Penalizar títulos genéricos
      if (text.includes('five minute') || text.includes('bulletin') || text.includes('podcast')) score -= 50;

      return { ...a, score, category: detectCategory(a) };
    });

    // Ordenar por puntuación — las más importantes primero
    scored.sort((a, b) => b.score - a.score);

    // Tomar las top 12 más relevantes
    const top12 = scored.slice(0, 12).map(a => ({
      title: a.title,
      description: a.description || '',
      content: a.content || '',
      url: a.url,
      urlToImage: a.urlToImage,
      publishedAt: a.publishedAt,
      source: a.source,
      category: a.category,
      relevanceScore: a.score
    }));

    res.status(200).json({ articles: top12, total: top12.length });

  } catch(e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
}

function detectCategory(a) {
  const t = ((a.title||'')+(a.description||'')).toLowerCase();
  if (t.match(/sport|football|soccer|nba|nfl|tennis|golf|olympic|league|championship/)) return 'Deportes';
  if (t.match(/tech|ai|apple|google|microsoft|software|iphone|robot|cyber|chip|elon/)) return 'Tecnología';
  if (t.match(/econom|stock|market|inflation|bank|dollar|trade|gdp|fed|rate|wall street/)) return 'Economía';
  if (t.match(/science|nasa|space|climate|health|medicine|virus|cancer|research|discovery/)) return 'Ciencia';
  if (t.match(/politic|election|president|government|congress|senate|vote|minister|parliament/)) return 'Política';
  return 'Mundo';
}
