export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET’);
res.setHeader(‘Cache-Control’, ‘s-maxage=40, stale-while-revalidate=60’);

const { category } = req.query;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY;

if (!NEWS_API_KEY) {
return res.status(500).json({ error: ‘NEWS_API_KEY not configured’, articles: [] });
}

const categoryQueries = {
‘Mundo’:      ‘world international news’,
‘Política’:   ‘politics government election’,
‘Economía’:   ‘economy business finance market’,
‘Tecnología’: ‘technology AI software apple google’,
‘Deportes’:   ‘sports football soccer basketball’,
‘Ciencia’:    ‘science space nasa discovery’
};

try {
const query = (category && categoryQueries[category])
? categoryQueries[category]
: ‘breaking news world today’;


const sources = 'bbc-news,reuters,associated-press,cnn,al-jazeera-english,the-guardian-uk';
const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sources=${sources}&sortBy=publishedAt&pageSize=12&apiKey=${NEWS_API_KEY}`;

const response = await fetch(apiUrl);
const data = await response.json();

if (data.status !== 'ok') {
  throw new Error(data.message || 'NewsAPI error');
}

const raw = (data.articles || [])
  .filter(a => a.title && a.title !== '[Removed]' && a.urlToImage);

// Rewrite with Claude AI in Dominican style
const processed = await Promise.all(
  raw.map(async (article) => {
    const rewritten = ANTHROPIC_API_KEY
      ? await rewriteWithClaude(article, ANTHROPIC_API_KEY)
      : { title: article.title, description: article.description || '' };

    return {
      title:       rewritten.title,
      description: rewritten.description,
      content:     rewritten.description,
      url:         article.url,
      urlToImage:  article.urlToImage,
      publishedAt: article.publishedAt,
      source:      { name: 'AhoraNews' },
      category:    detectCategory(article),
      isViral:     rewritten.isViral || false,
      originalSource: article.source?.name || 'Unknown'
    };
  })
);

return res.status(200).json({ articles: processed, total: processed.length });


} catch (error) {
console.error(‘Error:’, error.message);
return res.status(500).json({ error: error.message, articles: [] });
}
}

// ── REESCRITURA CON CLAUDE ──
async function rewriteWithClaude(article, apiKey) {
try {
const prompt = `Eres el editor jefe de AhoraNews, el medio de noticias más popular de República Dominicana. Tu trabajo es reescribir noticias internacionales en un estilo dominicano: directo, con impacto, usando expresiones del habla dominicana cuando aplique, fácil de entender para cualquier persona.

NOTICIA ORIGINAL:
Título: ${article.title}
Descripción: ${article.description || ‘’}

INSTRUCCIONES:

1.⁠ ⁠Reescribe el TÍTULO con más impacto y gancho — que dé ganas de leerlo. Máximo 80 caracteres. Puedes usar expresiones como “¡Fuácata!”, “Se armó”, “Tremendo”, “Brutal”, “Lo que nadie esperaba”, etc. cuando aplique al tono de la noticia.
1.⁠ ⁠Reescribe la DESCRIPCIÓN en 2-3 oraciones en español dominicano claro y directo. Sin tecnicismos. Como si le contaras la noticia a un amigo.
1.⁠ ⁠Determina si esta noticia es VIRAL (true/false) — es viral si trata de algo que la gente comparte mucho en redes: chismes de famosos, récords, situaciones insólitas, humor, animales, fenómenos raros, deportes épicos.

Responde SOLO en este formato JSON exacto, sin texto adicional:
{
“title”: “título reescrito aquí”,
“description”: “descripción reescrita aquí”,
“isViral”: true o false
}`;


⁠ const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  })
});

const data = await response.json();
const text = data.content?.[0]?.text || '{}';

// Parse JSON response
const clean = text.replace(/ ⁠json|⁠ /g, '').trim();
const parsed = JSON.parse(clean);

return {
  title: parsed.title || article.title,
  description: parsed.description || article.description || '',
  isViral: parsed.isViral || false
};
 ⁠

} catch (err) {
console.error(‘Claude rewrite error:’, err.message);
// Fallback to original if Claude fails
return {
title: article.title,
description: article.description || ‘’,
isViral: false
};
}
}

// ── DETECTAR CATEGORÍA ──
function detectCategory(article) {
const text = ((article.title || ‘’) + ’ ’ + (article.description || ‘’)).toLowerCase();
if (text.match(/football|soccer|nba|nfl|sport|athlete|champion|tournament|goal|match|tennis|beisbol|baseball|mlb/)) return ‘Deportes’;
if (text.match(/tech|iphone|android|ai|artificial intelligence|software|app|google|apple|microsoft|openai/)) return ‘Tecnología’;
if (text.match(/economy|stock|market|price|inflation|bank|dollar|finance|gdp|trade|dolar|peso/)) return ‘Economía’;
if (text.match(/science|nasa|space|planet|medicine|vaccine|virus|research|discovery|climate/)) return ‘Ciencia’;
if (text.match(/government|president|congress|election|senate|law|politic|minister|party|vote/)) return ‘Política’;
return ‘Mundo’;
}
