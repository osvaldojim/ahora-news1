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

  // ── DEPORTES — primero y con la regex más amplia ──
  if (text.match(
    /futbol|football|soccer|nba|nfl|nhl|mlb|mls|pga|lpga|uefa|fifa|conmebol|concacaf|premier.?league|la.?liga|serie.?a|bundesliga|ligue.?1|champions.?league|europa.?league|copa.?del.?mundo|world.?cup|super.?bowl|stanley.?cup|wimbledon|us.?open|roland.?garros|australian.?open|tour.?de.?france|formula.?1|f1|moto.?gp|nascar|beisbol|baseball|baloncesto|basketball|tenis|tennis|golf|natacion|atletismo|olimpico|olimpiada|olympic|deporte|deportes|jugador|jugadora|entrenador|tecnico|gol|golazo|cancha|estadio|liga|torneo|campeonato|copa|medalla|podio|carrera|corredor|ciclismo|boxeo|pelea|knockout|ufc|mma|wrestl|yankee|dodger|laker|celtic|socceroo|striker|pitcher|quarterback|touchdown|homerun|home.?run|slam.?dunk|wicket|cricket|rugby|preakness|kentucky.?derby|belmont|indy.?500|draft|playoff|final|semifinal|cuartos|clasico|derby|fixture|marcador|resultado|victoria|derrota|empate|penalti|penalty|penal|fuera.?de.?juego|offside|var|arbitro|referee|coach|manager.?deportivo|fichaje|transferencia|traspaso|contrato.?deportivo|salario.?deportivo|lesion.?deportivo|mph|km\/h|velocidad.?lanzamiento|recta|curveball|slider|fastball|innings|strikes|batting|pitching|outfield|infield|shortstop|catcher|batter/
  )) return 'Deportes';

  // ── TECNOLOGÍA ──
  if (text.match(
    /tecnolog|tech|iphone|android|smartphone|tablet|laptop|computadora|ordenador|inteligencia.?artificial|machine.?learning|deep.?learning|chatgpt|openai|anthropic|gemini|gpt|llm|robot|robotica|software|hardware|app|aplicacion|startup|silicon.?valley|google|apple|microsoft|amazon|meta|nvidia|amd|intel|samsung|huawei|tesla.?tech|spacex|starlink|satellite|drone|ciberseguridad|hacker|malware|ransomware|criptomoneda|bitcoin|ethereum|blockchain|nft|metaverso|realidad.?virtual|realidad.?aumentada|5g|6g|internet|wifi|cloud|nube.?digital|data.?center|servidor|programacion|codigo|desarrollador|developer|github|linux|windows|macos|ios|android|pixel|galaxy|ipad|macbook/
  )) return 'Tecnología';

  // ── ECONOMÍA ──
  if (text.match(
    /econom|bolsa|mercado|wall.?street|nyse|nasdaq|dow.?jones|s&p|sp500|acciones|stock|precio|inflacion|deflacion|banco|fed|reserva.?federal|banco.?central|bcrd|tasa.?de.?interes|hipoteca|prestamo|credito|deuda|deficit|superavit|pib|gdp|desempleo|empleo|trabajo|salario|sueldo|sindicato|huelga|comercio|exportacion|importacion|tarifa|arancel|sancion|embargo|oil|petroleo|gas|energia|electricidad|factura|impuesto|iva|reforma.?fiscal|presupuesto|deuda.?publica|fmi|fondo.?monetario|banco.?mundial|ocde|g7|g20|recesion|crecimiento.?economico|inflacion|dolar|euro|peso|yen|libra|moneda|tipo.?de.?cambio|remesa|inversion|inversionista|hedge.?fund|private.?equity|ipo|fusion|adquisicion|quiebra|bancarrota/
  )) return 'Economía';

  // ── CIENCIA ──
  if (text.match(
    /ciencia|nasa|esa|spacex|cohete|cohetes|lanzamiento.?espacial|planeta|asteroide|cometa|galaxia|universo|agujero.?negro|big.?bang|telescopio|hubble|james.?webb|marte|luna|mercurio|venus|jupiter|saturno|urano|neptuno|pluton|exoplaneta|astrofisica|cosmologia|fisica|quimica|biologia|genetica|adn|dna|celula|bacteria|virus|pandemia|vacuna|medicina|cirugia|cancer|alzheimer|diabetes|covid|variante|mutacion|farmaco|ensayo.?clinico|investigacion|estudio|descubrimiento|hallazgo|laboratorio|experiment|particula|quantum|cuantico|hidrogeno|nuclear|fusion.?nuclear|cambio.?climatico|calentamiento|temperatura|glaciar|antartica|artico|biodiversidad|extincion|ecosistema|oceano|terremoto|volcan|tsunami|huracan|tifon|tormenta.?tropical|inundacion|sequia|incendio.?forestal/
  )) return 'Ciencia';

  // ── POLÍTICA ──
  if (text.match(
    /politic|gobierno|presidente|presidenta|primer.?ministro|canciller|congreso|senado|diputado|parlamento|asamblea|eleccion|elecciones|votacion|referendum|campaña.?electoral|partido.?politico|democracia|dictadura|golpe.?de.?estado|protesta|manifestacion|marcha|huelga.?general|ley|decreto|reforma|constitucion|tribunal|corte|juicio|fiscal|procurador|embajador|embajada|diplomatico|tratado|acuerdo|cumbre|otan|nato|onu|union.?europea|abinader|leonel|danilo|luis.?abinader|fuerza.?del.?pueblo|pld|prd|prm|gobierno.?dominicano|casa.?nacional|palacio.?nacional|trump|biden|harris|obama|putin|xi.?jinping|macron|merkel|scholz|zelensky|netanyahu|modi|lula|milei|maduro|ortega|bukele|guerra|conflicto|invasion|ataque.?militar|bomba|misil|soldado|ejercito|fuerzas.?armadas|paz|ceasefire|alto.?al.?fuego/
  )) return 'Política';

  // ── NACIONALES ──
  if (text.match(
    /dominicana|dominicano|republica.?dominicana|santo.?domingo|santiago|la.?romana|san.?pedro|puerto.?plata|la.?vega|san.?francisco|bani|azua|barahona|cotui|cotuí|moca|bonao|higuey|higüey|punta.?cana|bavaro|bajos.?de.?haina|haiti|haitiano|frontera.?dominicana|policía.?nacional|policia.?nacional|digesett|dncd|ejercito.?dominicano|armada.?dominicana|fuerza.?aerea|ministerio.*dominic|congreso.?dominicano|senado.?dominicano|camara.?de.?diputados|ayuntamiento|alcalde|jce|tse|me.?rd|salud.?publica|listín|listin.?diario|diario.?libre|el.?caribe|noticias.?sin|acento\.com|elnacional|hoy\.com|ultimahora\.do|almomento|deultimominuto|rd\$|peso.?dominicano|edesur|edenorte|edeeste|edes|corte.?electrica|apagon|caasd|inapa|intrant|amet|mopc|obras.?publicas|indrhi/
  )) return 'Nacionales';

  return 'Mundo';
}
