let publishedArticles = [];
const SECRET_KEY = process.env.PUBLISH_SECRET || 'ahoranews2026';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ articles: publishedArticles.slice(0, 20), total: publishedArticles.length });
  }

  if (req.method === 'POST') {
    const auth = req.headers['authorization'] || req.body?.secret;
    if (auth !== SECRET_KEY && auth !== `Bearer ${SECRET_KEY}`) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // El texto completo de Claude viene en titulo o contenido
    const rawText = req.body?.titulo || req.body?.contenido || '';

    // Extraer partes del formato que Claude devuelve
    function extract(text, key) {
      const patterns = [
        new RegExp(key + ':\\s*(.+?)(?=\\n[A-ZÁÉÍÓÚ]+:|$)', 'si'),
        new RegExp('\\*\\*' + key + '\\*\\*:?\\s*(.+?)(?=\\n\\*\\*[A-Z]|$)', 'si'),
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m && m[1]) return m[1].trim();
      }
      return null;
    }

    const titulo    = extract(rawText, 'TÍTULO') || extract(rawText, 'TITULO') || 'Noticia de AHORA.news';
    const contenido = extract(rawText, 'CONTENIDO') || rawText.slice(0, 800) || '';
    const categoria = extract(rawText, 'CATEGORÍA') || extract(rawText, 'CATEGORIA') || req.body?.categoria || 'Mundo';
    const instagram = extract(rawText, 'INSTAGRAM') || '';
    const tiktok    = extract(rawText, 'TIKTOK') || '';

    const article = {
      id: Date.now(),
      title: titulo.replace(/\*\*/g, '').trim(),
      description: contenido.slice(0, 200).replace(/\*\*/g, '') + '...',
      content: contenido.replace(/\*\*/g, ''),
      category: categoria.replace(/\*\*/g, '').trim(),
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

  return res.status(405).json({ error: 'Método no permitido' });
}

function getCategoryImage(category) {
  const images = {
    'Deportes':   'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
    'Tecnología': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    'Economía':   'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80',
    'Ciencia':    'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80',
    'Política':   'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80',
    'Mundo':      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80',
  };
  return images[category] || images['Mundo'];
}
