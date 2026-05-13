module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET’);

const FALLBACK = [
{ ticker: ‘NVDA’, nombre: ‘NVIDIA Corp’, accion: ‘COMPRAR’, precio: ‘$875’, razon: ‘Fuerte demanda de chips IA en mercados globales’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘AAPL’, nombre: ‘Apple Inc’, accion: ‘COMPRAR’, precio: ‘$182’, razon: ‘Ciclo de actualizacion iPhone con IA integrada’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘JPM’, nombre: ‘JPMorgan Chase’, accion: ‘NEUTRAL’, precio: ‘$195’, razon: ‘Resultados solidos pero presion en tasas de interes’, confianza: ‘Media’, color: ‘#e07b00’ },
{ ticker: ‘XOM’, nombre: ‘ExxonMobil’, accion: ‘COMPRAR’, precio: ‘$118’, razon: ‘Precios del petroleo al alza por tensiones globales’, confianza: ‘Media’, color: ‘#007a3d’ }
];

try {
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
return res.status(200).json({ recs: FALLBACK, source: ‘fallback’ });
}


⁠ const today = new Date().toLocaleDateString('es-DO', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: 'Hoy es ' + today + '. Dame 4 recomendaciones de acciones para comprar hoy en la bolsa de EE.UU. Responde SOLO con JSON valido sin markdown ni texto extra. Formato exacto: [{"ticker":"NVDA","nombre":"NVIDIA Corp","accion":"COMPRAR","precio":"$875","razon":"Razon breve max 10 palabras","confianza":"Alta","color":"#007a3d"}]. Colores: #007a3d comprar, #cc0000 vender, #e07b00 neutral.'
    }]
  })
});

if (!response.ok) {
  return res.status(200).json({ recs: FALLBACK, source: 'fallback' });
}

const data = await response.json();
const text = data.content[0].text.replace(/ ⁠json|⁠ /g, '').trim();
const recs = JSON.parse(text);
return res.status(200).json({ recs: recs, source: 'ai' });
 ⁠

} catch (e) {
return res.status(200).json({ recs: FALLBACK, source: ‘fallback’ });
}
};
