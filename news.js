const PEXELS_KEY = 'F0AAtd8PycNzm8mqfyumWqHXtyblVYQlxqUlScxjRST1J5Owq5VYFQQv';

// Cache de imágenes Pexels para no repetir llamadas en el mismo request
const pexelsCache = {};

async function getPexelsImage(query) {
  const key = query.slice(0, 30);
  if (pexelsCache[key]) return pexelsCache[key];

  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY }, signal: AbortSignal.timeout(4000) }
    );
    const data = await r.json();
    const photos = data?.photos || [];
    if (!photos.length) return null;

    // Elegir foto aleatoria de las primeras 5 para variedad
    const photo = photos[Math.floor(Math.random() * photos.length)];
    const img = photo.src?.large || photo.src?.medium || null;
    if (img) pexelsCache[key] = img;
    return img;
  } catch {
    return null;
  }
}

// Extraer keywords relevantes del título para buscar en Pexels
function extractKeywords(title) {
  // Palabras vacías en español
  const stopwords = new Set([
    'de','la','el','los','las','en','un','una','que','por','con','del','al','se',
    'es','su','para','como','pero','más','este','esta','estos','estas','son','fue',
    'han','hay','sus','una','nos','les','también','sobre','entre','cuando','donde',
    'ya','si','no','lo','le','me','mi','tu','yo','él','ella','ellos','ellas','dos',
    'tres','cuatro','cinco','uno','mil','tras','ante','bajo','hasta','desde','será'
  ]);
  return title
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'«»()]/g, '')
    .split(' ')
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 3)
    .join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // FIX: reducir stale-while-revalidate para que el usuario vea noticias frescas más rápido
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=20');

  const { category } = req.query;

  const RSS_FEEDS = [
    // República Dominicana
    'https://www.listindiario.com/rss/portada.xml',
    'https://noticiassin.com/feed/',
    'https://www.diariolibre.com/rss/portada.xml',
    'https://www.elcaribe.com.do/feed/',
    'https://almomento.net/feed/',
    'https://acento.com.do/feed/',
    'https://www.deultimominuto.com/feed/',
    'https://elnacional.com.do/feed/',
    'https://www.hoy.com.do/feed/',
    // Internacional en español
    'https://feeds.bbci.co.uk/mundo/rss.xml',
    'https://www.infobae.com/feeds/rss/',
    'https://rss.nytimes.com/services/xml/rss/nyt/es/World.xml',
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'
  ];

  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(url =>
        fetch(url, {
          headers: { 'User-Agent': 'AhoraNews/1.0' },
          signal: AbortSignal.timeout(5000)
        })
        .then(r => r.text())
        .then(xml => parseRSS(xml))
        .catch(() => [])
      )
    );

    let allArticles = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.length) {
        allArticles = allArticles.concat(r.value);
      }
    });

    // Deduplicar por título
    const seenTitles = new Set();
    allArticles = allArticles.filter(a => {
      if (!a.title) return false;
      if (seenTitles.has(a.title)) return false;
      seenTitles.add(a.title);
      return true;
    });

    // Filtrar por categoría si aplica
    if (category) {
      allArticles = allArticles.filter(a => detectCategory(a) === category);
    }

    // Ordenar por fecha - más recientes primero
    allArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Tomar top 20 para tener margen luego del filtro de imágenes
    const top = allArticles.slice(0, 20);

    // FIX PRINCIPAL: Para artículos sin imagen, buscar en Pexels con keywords del título
    // Hacerlo en paralelo para no demorar
    const withImages = await Promise.all(
      top.map(async (article) => {
        let img = article.urlToImage;

        if (!img) {
          const keywords = extractKeywords(article.title);
          if (keywords) {
            img = await getPexelsImage(keywords);
          }
          // Si Pexels tampoco encuentra, usar imagen genérica por categoría
          if (!img) {
            img = getCategoryFallback(detectCategory(article));
          }
        }

        return { ...article, urlToImage: img };
      })
    );

    // Deduplicar imágenes DESPUÉS de asignar Pexels (para no mostrar la misma foto dos veces)
    const seenImgs = new Set();
    const processed = withImages
      .filter(a => {
        if (!a.urlToImage) return false;
        if (seenImgs.has(a.urlToImage)) return false;
        seenImgs.add(a.urlToImage);
        return true;
      })
      .slice(0, 12)
      .map(article => ({
        title:          article.title,
        description:    article.description || '',
        content:        article.content || article.description || '',
        body:           article.content || article.description || '',
        url:            article.url,
        urlToImage:     article.urlToImage,
        publishedAt:    article.publishedAt,
        source:         { name: 'AhoraNews' },
        category:       detectCategory(article),
        isViral:        false,
        originalSource: article.source || 'Unknown',
        needsRewrite:   true
      }));

    return res.status(200).json({ articles: processed, total: processed.length });

  } catch (error) {
    console.error('RSS Error:', error.message);
    return res.status(500).json({ error: error.message, articles: [] });
  }
}

// Imagen de fallback por categoría (fotos neutras de Pexels hardcodeadas)
function getCategoryFallback(category) {
  const fallbacks = {
    'Deportes':    'https://images.pexels.com/photos/46798/the-ball-stadion-football-the-pitch-46798.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Tecnología':  'https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Economía':    'https://images.pexels.com/photos/534216/pexels-photo-534216.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Ciencia':     'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Política':    'https://images.pexels.com/photos/1550337/pexels-photo-1550337.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Nacionales':  'https://images.pexels.com/photos/3494806/pexels-photo-3494806.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Mundo':       'https://images.pexels.com/photos/335393/pexels-photo-335393.jpeg?auto=compress&cs=tinysrgb&w=800',
  };
  return fallbacks[category] || fallbacks['Mundo'];
}

// ── PARSE RSS XML ──
function parseRSS(xml) {
  const articles = [];
  try {
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    items.forEach(item => {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link') || extractTag(item, 'guid');
      const description = extractTag(item, 'description');
      const pubDate = extractTag(item, 'pubDate');
      const source = extractTag(item, 'source') || '';

      // Extraer imagen - múltiples métodos
      let img = '';
      const mediaMatch = item.match(/media:content[^>]*url="([^"]+)"/);
      if (mediaMatch) img = mediaMatch[1];
      if (!img) {
        const encMatch = item.match(/enclosure[^>]*url="([^"]+)"/);
        if (encMatch) img = encMatch[1];
      }
      if (!img) {
        const ogMatch = description && description.match(/src="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
        if (ogMatch) img = ogMatch[1];
      }

      // FIX: ya no descartamos artículos sin imagen — Pexels los rescata arriba
      if (title && link) {
        articles.push({
          title:       cleanText(title),
          description: cleanText(description || '').slice(0, 200),
          content:     cleanText(description || ''),
          url:         link,
          urlToImage:  img || null,   // null si no hay, se resuelve con Pexels
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          source:      source
        });
      }
    });
  } catch(e) {}
  return articles;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'));
  return match ? (match[1] || match[2] || '').trim() : '';
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function detectCategory(article) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  if (text.match(/futbol|soccer|nba|nfl|beisbol|baseball|mlb|deporte|atletismo|campeonato|torneo|jugador|partido/)) return 'Deportes';
  if (text.match(/tech|iphone|android|ia|inteligencia artificial|software|app|google|apple|microsoft/)) return 'Tecnología';
  if (text.match(/economia|bolsa|mercado|precio|inflacion|banco|dolar|peso|finanza|impuesto/)) return 'Economía';
  if (text.match(/ciencia|nasa|espacio|planeta|medicina|vacuna|virus|investigacion|descubrimiento|clima/)) return 'Ciencia';
  if (text.match(/gobierno|presidente|congreso|eleccion|senado|ley|politica|ministro|partido|abinader/)) return 'Política';
  if (text.match(/nacional|dominicana|dominicano|santo domingo|santiago|haiti|rd |republica/)) return 'Nacionales';
  return 'Mundo';
}
