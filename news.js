// api/news.js
// Este archivo corre en el servidor de Vercel.
// Llama a NewsAPI, traduce categorías y devuelve las noticias al frontend.
// Tu API Key está segura aquí — nadie la puede ver desde el navegador.

export default async function handler(req, res) {
  // Permitir que el frontend de cualquier dominio haga peticiones
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=40, stale-while-revalidate');

  const { category } = req.query;

  // ══════════════════════════════════════════════
  // TU API KEY DE NEWSAPI — GUARDADA DE FORMA SEGURA
  // En Vercel la guardas en Environment Variables
  // Nunca la escribas directamente aquí en producción
  // ══════════════════════════════════════════════
  const NEWS_API_KEY = process.env.NEWS_API_KEY;

  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: 'NEWS_API_KEY not configured' });
  }

  // Mapeo de categorías del frontend a categorías de NewsAPI
  const categoryMap = {
    'Mundo':      'general',
    'Política':   'politics',
    'Economía':   'business',
    'Tecnología': 'technology',
    'Deportes':   'sports',
    'Ciencia':    'science'
  };

  // Mapeo inverso: de NewsAPI a español para mostrar en la web
  const reverseCategoryMap = {
    'general':    'Mundo',
    'politics':   'Política',
    'business':   'Economía',
    'technology': 'Tecnología',
    'sports':     'Deportes',
    'science':    'Ciencia',
    'health':     'Ciencia',
    'entertainment': 'Mundo'
  };

  try {
    // Construir URL de NewsAPI
    let apiUrl;

    if (category && categoryMap[category]) {
      // Categoría específica
      apiUrl = `https://newsapi.org/v2/top-headlines?category=${categoryMap[category]}&language=es&pageSize=12&apiKey=${NEWS_API_KEY}`;
    } else {
      // Todas las noticias principales
      // Usamos sources top para máxima calidad
      apiUrl = `https://newsapi.org/v2/top-headlines?language=es&pageSize=12&apiKey=${NEWS_API_KEY}`;
    }

    // Llamar a NewsAPI desde el servidor (no desde el navegador)
    const response = await fetch(apiUrl);

    if (!response.ok) {
      // Si falla en español, intentamos en inglés
      const fallbackUrl = `https://newsapi.org/v2/top-headlines?language=en&pageSize=12&sources=bbc-news,reuters,associated-press,cnn,the-guardian-uk&apiKey=${NEWS_API_KEY}`;
      const fallbackResp = await fetch(fallbackUrl);
      if (!fallbackResp.ok) throw new Error('NewsAPI error: ' + response.status);
      const fallbackData = await fallbackResp.json();
      return res.status(200).json(processArticles(fallbackData.articles, reverseCategoryMap));
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error('NewsAPI returned: ' + data.message);
    }

    // Procesar y devolver artículos
    return res.status(200).json(processArticles(data.articles, reverseCategoryMap));

  } catch (error) {
    console.error('News API Error:', error.message);
    return res.status(500).json({
      error: error.message,
      articles: []
    });
  }
}

// ══════════════════════════════════════════════
// PROCESAR ARTÍCULOS
// Limpia y formatea los datos de NewsAPI
// ══════════════════════════════════════════════
function processArticles(articles, reverseCategoryMap) {
  if (!articles || articles.length === 0) return { articles: [] };

  const processed = articles
    .filter(function(a) {
      // Filtrar artículos sin título o imagen
      return a.title && a.title !== '[Removed]';
    })
    .map(function(article) {
      return {
        title:       article.title || '',
        description: article.description || '',
        content:     article.content || article.description || '',
        url:         article.url || '#',
        urlToImage:  article.urlToImage || '',
        publishedAt: article.publishedAt || new Date().toISOString(),
        source:      article.source || { name: 'Desconocido' },
        category:    detectCategory(article, reverseCategoryMap)
      };
    });

  return { articles: processed, total: processed.length };
}

// ══════════════════════════════════════════════
// DETECTAR CATEGORÍA AUTOMÁTICAMENTE
// La IA detecta el tema de cada noticia
// ══════════════════════════════════════════════
function detectCategory(article, reverseCategoryMap) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();

  if (text.match(/fútbol|soccer|nba|nfl|deporte|atleta|campeón|torneo|gol|partido/)) return 'Deportes';
  if (text.match(/tecnología|iphone|android|ia|inteligencia artificial|software|app|google|apple|microsoft|openai/)) return 'Tecnología';
  if (text.match(/economía|bolsa|mercado|precio|inflación|banco|dólar|euro|finanzas|pib/)) return 'Economía';
  if (text.match(/ciencia|nasa|espacio|planeta|medicina|vacuna|virus|investigación|descubrimiento/)) return 'Ciencia';
  if (text.match(/gobierno|presidente|congreso|elecciones|senado|ley|político|ministro|partido/)) return 'Política';

  return 'Mundo';
}
