export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=40, stale-while-revalidate=60');

  const { category } = req.query;
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
  const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY;

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

  try {
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

    // Filter out removed, missing images, and duplicate images
    const seenImgs = new Set();
    const raw = (data.articles || [])
      .filter(a => {
        if (!a.title || a.title === '[Removed]' || !a.urlToImage) return false;
        if (seenImgs.has(a.urlToImage)) return false;
        seenImgs.add(a.urlToImage);
        return true;
      });

    // Get relevant images from Unsplash for each article
    const processed = await Promise.all(
      raw.map(async (article) => {
        const img = await getCoherentImage(article, ANTHROPIC_API_KEY);
        return {
          title:          article.title,
          description:    article.description || '',
          content:        article.content || article.description || '',
          body:           article.content || article.description || '',
          url:            article.url,
          urlToImage:     img,
          publishedAt:    article.publishedAt,
          source:         article.source || { name: 'Unknown' },
          category:       detectCategory(article),
          isViral:        false,
          originalSource: article.source?.name || 'Unknown',
          needsRewrite:   true
        };
      })
    );

    return res.status(200).json({ articles: processed, total: processed.length });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message, articles: [] });
  }
}

// ── IMAGEN COHERENTE CON PEXELS ──
async function getCoherentImage(article, claudeKey) {
  try {
    const PEXELS_KEY = 'F0AAtd8PycNzm8mqfyumWqHXtyblVYQlxqUlScxjRST1J5Owq5VYFQQv';
    
    // Use Claude to get a smart English search query
    let searchQuery = '';
    
    if (claudeKey) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 15,
          messages: [{ role: 'user', content: 'Give me a 2-3 word English photo search query for this news headline. Only the query, nothing else: ' + article.title }]
        })
      });
      const data = await resp.json();
      searchQuery = (data.content?.[0]?.text || '').trim().replace(/[^a-zA-Z0-9 ]/g, '');
    }

    // Fallback query from category
    if (!searchQuery) {
      const catMap = {
        'Deportes': 'sports athlete',
        'Economía': 'business finance',
        'Tecnología': 'technology computer',
        'Política': 'government politics',
        'Ciencia': 'science research',
        'Mundo': 'world news city',
        'Nacionales': 'Dominican Republic'
      };
      searchQuery = catMap[article.category] || 'news world';
    }

    // Search Pexels
    const pexResp = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
      { headers: { 'Authorization': PEXELS_KEY } }
    );
    const pexData = await pexResp.json();
    
    if (pexData.photos && pexData.photos.length > 0) {
      const idx = Math.floor(Math.random() * Math.min(5, pexData.photos.length));
      return pexData.photos[idx].src.large;
    }
    return article.urlToImage;
  } catch(e) {
    console.error('Pexels error:', e.message);
    return article.urlToImage;
  }
}

// ── REESCRITURA CON CLAUDE ──// ── REESCRITURA CON CLAUDE ──// ── REESCRITURA CON CLAUDE ──
async function rewriteWithClaude(article, apiKey) {
  try {
    const prompt = `Eres periodista estrella de AhoraNews, el medio más leído de República Dominicana. Debes escribir un artículo periodístico COMPLETO basándote en la información disponible.

DATOS DE LA NOTICIA:
Título original: ${article.title}
Resumen: ${article.description || ''}

TU MISIÓN:
1. TÍTULO NUEVO: Impactante, dominicano, diferente al original. Usa "Se armó", "Brutal", "Tremendo", "Lo que pasó", "Agárrate", "Fuácata" si aplica. Máx 80 caracteres.

2. DESCRIPCIÓN: 2 oraciones directas como si le contaras el chisme a un amigo dominicano.

3. CUERPO DEL ARTÍCULO: Escribe un artículo periodístico COMPLETO y EXTENSO con esta estructura:
   - Párrafo 1 (ENTRADA): El hecho principal explicado con claridad. Quién, qué, cuándo, dónde.
   - Párrafo 2 (CONTEXTO): Antecedentes. ¿Por qué pasó esto? ¿Qué llevó a esta situación?
   - Párrafo 3 (IMPACTO): ¿Cómo afecta esto a la gente, al país, al mundo?
   - Párrafo 4 (REACCIÓN): ¿Qué dicen los expertos, políticos, ciudadanos o afectados?
   - Párrafo 5 (RD): ¿Cómo se relaciona esto con República Dominicana o los dominicanos?
   - Párrafo 6 (CIERRE): Perspectiva futura. ¿Qué viene ahora?
   Cada párrafo mínimo 60 palabras. Total mínimo 400 palabras. Separados por \n\n.

4. isViral: true si es sobre famosos, crímenes impactantes, récords, humor, deportes épicos, política.

IMPORTANTE: Si la información original es limitada, EXPANDE con contexto general relevante y verídico sobre el tema. Escribe como un periodista profesional dominicano.

Responde SOLO en JSON sin markdown ni texto extra:
{"title":"aquí","description":"aquí","body":"párrafo1\n\npárrafo2\n\npárrafo3\n\npárrafo4\n\npárrafo5\n\npárrafo6","isViral":false}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    console.log('Claude raw response length:', text.length);

    // Parse JSON response - handle multiline body
    let parsed = {};
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(parseErr) {
      // Try to extract fields manually if JSON is broken
      console.error('JSON parse error, trying manual extraction');
      const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
      const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/);
      const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]+?)(?:","isViral|"\s*})/);
      const viralMatch = text.match(/"isViral"\s*:\s*(true|false)/);
      parsed = {
        title: titleMatch ? titleMatch[1] : article.title,
        description: descMatch ? descMatch[1] : (article.description || ''),
        body: bodyMatch ? bodyMatch[1].replace(/\n/g, '
') : (article.description || ''),
        isViral: viralMatch ? viralMatch[1] === 'true' : false
      };
    }

    console.log('Body length:', (parsed.body || '').length);

    return {
      title: parsed.title || article.title,
      description: parsed.description || article.description || '',
      body: parsed.body || parsed.description || article.description || '',
      isViral: parsed.isViral || false
    };

  } catch (err) {
    console.error('Claude rewrite error:', err.message);
    // Fallback to original if Claude fails
    return {
      title: article.title,
      description: article.description || '',
      body: article.content || article.description || '',
      isViral: false
    };
  }
}

// ── DETECTAR CATEGORÍA ──
function detectCategory(article) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  if (text.match(/football|soccer|nba|nfl|sport|athlete|champion|tournament|goal|match|tennis|beisbol|baseball|mlb/)) return 'Deportes';
  if (text.match(/tech|iphone|android|ai|artificial intelligence|software|app|google|apple|microsoft|openai/)) return 'Tecnología';
  if (text.match(/economy|stock|market|price|inflation|bank|dollar|finance|gdp|trade|dolar|peso/)) return 'Economía';
  if (text.match(/science|nasa|space|planet|medicine|vaccine|virus|research|discovery|climate/)) return 'Ciencia';
  if (text.match(/government|president|congress|election|senate|law|politic|minister|party|vote/)) return 'Política';
  return 'Mundo';
}
