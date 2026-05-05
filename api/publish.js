let publishedArticles = [];
const SECRET_KEY = process.env.PUBLISH_SECRET || 'ahoranews2026';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET sin parámetros: devuelve artículos publicados ──
  const { secret, text } = req.query;

  if (req.method === 'GET' && !text) {
    return res.status(200).json({ articles: publishedArticles.slice(0, 20), total: publishedArticles.length });
  }

  // ── GET con parámetros: publicar artículo ──
  if (req.method === 'GET' && text) {
    if (secret !== SECRET_KEY) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const rawText = decodeURIComponent(text);

    function extract(txt, ...keys) {
      for (const key of keys) {
        const p = new RegExp(key + '[:\\s]+([^\\n]+(?:\\n(?![A-ZÁÉÍÓÚ]{3,}[:\\s])[^\\n]+)*)', 'i');
        const m = txt.match(p);
        if (m && m[1] && m[1].trim().length > 3) return m[1].replace(/\*\*/g, '').trim();
      }
      return null;
    }

    const titulo    = extract(rawText, 'TÍTULO','TITULO') || rawText.split('\n')[0].slice(0,120) || 'Noticia de AHORA.news';
    const contenido = extract(rawText, 'CONTENIDO','Contenido') || rawText;
    const categoria = extract(rawText, 'CATEGORÍA','CATEGORIA') || 'Mundo';
    const instagram = extract(rawText, 'INSTAGRAM') || '';
    const tiktok    = extract(rawText, 'TIKTOK','TikTok') || '';

    const article = {
      id: Date.now(),
      title: titulo.split('\n')[0].slice(0,150).trim(),
      description: contenido.replace(/\n/g,' ').slice(0,250) + '...',
      content: contenido,
      category: categoria.split('\n')[0].slice(0,50).trim(),
      urlToImage: getCategoryImage(categoria),
      publishedAt: new Date().toISOString(),
      source: { name: 'Redacción AHORA.news' },
      instagram, tiktok,
      isDominican: true,
      isEditorPick: true,
      url: '#'
    };

    publishedArticles.unshift(article);
    if (publishedArticles.length > 50) publishedArticles = publishedArticles.slice(0, 50);

    console.log('✅ Publicado:', article.title);
    return res.status(200).json({ success: true, article });
  }

  // ── POST: también aceptar ──
  if (req.method === 'POST') {
    const auth = req.headers['authorization'] || req.body?.secret;
    if (auth !== SECRET_KEY && auth !== `Bearer ${SECRET_KEY}`) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const rawText = req.body?.text || req.body?.titulo || req.body?.contenido || '';
    if (!rawText) return res.status(400).json({ error: 'No text provided' });

    const article = {
      id: Date.now(),
      title: rawText.split('\n')[0].slice(0,150).trim() || 'Noticia de AHORA.news',
      description: rawText.replace(/\n/g,' ').slice(0,250) + '...',
      content: rawText,
      category: 'Mundo',
      urlToImage: getCategoryImage('Mundo'),
      publishedAt: new Date().toISOString(),
      source: { name: 'Redacción AHORA.news' },
      isDominican: true, isEditorPick: true, url: '#'
    };
    publishedArticles.unshift(article);
    if (publishedArticles.length > 50) publishedArticles = publishedArticles.slice(0, 50);
    return res.status(200).json({ success: true, article });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

function getCategoryImage(category) {
  const cat = (category||'').toLowerCase();
  if (cat.includes('deporte')) return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80';
  if (cat.includes('tecnolog')) return 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80';
  if (cat.includes('econom')) return 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80';
  if (cat.includes('ciencia')) return 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80';
  if (cat.includes('pol')) return 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80';
  return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';
}
