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

    // Recibir el texto completo de Claude (puede venir en cualquier campo)
    const rawText = req.body?.titulo || req.body?.contenido || req.body?.text || '';

    // Extraer partes del formato de Claude
    function extract(text, ...keys) {
      for (const key of keys) {
        const patterns = [
          new RegExp(key + '[:\\s]+([^\\n]+(?:\\n(?![A-ZÁÉÍÓÚ]{2,}:)[^\\n]+)*)', 'i'),
          new RegExp('\\*\\*' + key + '\\*\\*:?\\s*([^\\n]+)', 'i'),
        ];
        for (const p of patterns) {
          const m = text.match(p);
          if (m && m[1] && m[1].trim().length > 3) {
            return m[1].replace(/\*\*/g, '').trim();
          }
        }
      }
      return null;
    }

    const titulo    = extract(rawText, 'TÍTULO', 'TITULO', 'Título', 'Titulo') || 'Noticia de AHORA.news';
    const contenido = extract(rawText, 'CONTENIDO', 'Contenido') || rawText.slice(0, 1000) || '';
    const categoria = extract(rawText, 'CATEGORÍA', 'CATEGORIA', 'Categoría', 'Categoria') || 'Mundo';
    const instagram = extract(rawText, 'INSTAGRAM', 'Instagram') || '';
    const tiktok    = extract(rawText, 'TIKTOK', 'TikTok', 'Tiktok') || '';

    // Limpiar el título — tomar solo la primera línea si es muy largo
    const tituloClean = titulo.split('\n')[0].slice(0, 150).trim();
    const categoriaClean = categoria.split('\n')[0].slice(0, 50).trim();

    const article = {
      id: Date.now(),
      title: tituloClean,
      description: contenido.slice(0, 250).replace(/\n/g, ' ') + '...',
      content: contenido,
      category: categoriaClean,
      urlToImage: getCategoryImage(categoriaClean),
      publishedAt: new Date().toISOString(),
      source: { name: 'Redacción AHORA.news' },
      instagram, tiktok,
      isDominican: true,
      isEditorPick: true,
      url: '#',
      rawText: rawText.slice(0, 100) // debug
    };

    publishedArticles.unshift(article);
    if (publishedArticles.length > 50) publishedArticles = publishedArticles.slice(0, 50);

    console.log('✅ Publicado:', tituloClean);
    return res.status(200).json({ success: true, article, debug: { rawTextLength: rawText.length, rawTextStart: rawText.slice(0, 200) } });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

function getCategoryImage(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('deporte')) return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80';
  if (cat.includes('tecnolog')) return 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80';
  if (cat.includes('econom')) return 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80';
  if (cat.includes('ciencia')) return 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80';
  if (cat.includes('pol')) return 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80';
  return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';
}
