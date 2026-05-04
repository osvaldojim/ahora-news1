// api/publish.js
// Este endpoint recibe noticias desde Make.com y las guarda
// Make.com → Claude reescribe → llama este endpoint → aparece en ahoranews.news

// Almacenamiento en memoria (persiste mientras Vercel no reinicia)
// Para producción real usar una base de datos como Supabase o Airtable
let publishedArticles = [];

const SECRET_KEY = process.env.PUBLISH_SECRET || 'ahoranews2026';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── GET: Devuelve los artículos publicados ──
  if (req.method === 'GET') {
    return res.status(200).json({
      articles: publishedArticles.slice(0, 20), // Últimos 20
      total: publishedArticles.length
    });
  }

  // ── POST: Recibe y guarda un artículo nuevo ──
  if (req.method === 'POST') {
    // Verificar clave secreta
    const auth = req.headers['authorization'] || req.body?.secret;
    if (auth !== SECRET_KEY && auth !== `Bearer ${SECRET_KEY}`) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { titulo, contenido, categoria, instagram, tiktok, imagen } = req.body;

    if (!titulo || !contenido) {
      return res.status(400).json({ error: 'Título y contenido son requeridos' });
    }

    // Crear artículo
    const article = {
      id: Date.now(),
      title: titulo,
      description: contenido.slice(0, 200) + '...',
      content: contenido,
      category: categoria || 'Mundo',
      urlToImage: imagen || getCategoryImage(categoria),
      publishedAt: new Date().toISOString(),
      source: { name: 'Redacción AHORA.news' },
      instagram: instagram || '',
      tiktok: tiktok || '',
      isDominican: true,
      isEditorPick: true, // Marca especial para noticias del editor
      url: '#'
    };

    // Guardar al inicio de la lista (más reciente primero)
    publishedArticles.unshift(article);

    // Mantener máximo 50 artículos en memoria
    if (publishedArticles.length > 50) {
      publishedArticles = publishedArticles.slice(0, 50);
    }

    console.log('✅ Artículo publicado:', titulo);

    return res.status(200).json({
      success: true,
      message: 'Artículo publicado en AHORA.news',
      article: article
    });
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
