const https = require(‘https’);

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
return res.status(200).json({ recs: FALLBACK, source: ‘fallback-nokey’ });
}


⁠ const today = new Date().toLocaleDateString('es-DO', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const body = JSON.stringify({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 600,
  messages: [{
    role: 'user',
    content: 'Hoy es ' + today + '. Dame 4 recomendaciones de acciones. Responde SOLO con JSON sin markdown. Formato: [{"ticker":"NVDA","nombre":"NVIDIA Corp","accion":"COMPRAR","precio":"$875","razon":"Razon breve","confianza":"Alta","color":"#007a3d"}]. Colores: #007a3d comprar, #cc0000 vender, #e07b00 neutral.'
  }]
});

const data = await new Promise((resolve, reject) => {
  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const reqHttp = https.request(options, (resp) => {
    let raw = '';
    resp.on('data', chunk => raw += chunk);
    resp.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch(e) { reject(e); }
    });
  });
  reqHttp.on('error', reject);
  reqHttp.write(body);
  reqHttp.end();
});

const text = data.content[0].text.replace(/ ⁠json|⁠ /g, '').trim();
const recs = JSON.parse(text);
return res.status(200).json({ recs: recs, source: 'ai' });
 ⁠

} catch(e) {
return res.status(200).json({ recs: FALLBACK, source: ‘fallback-error’, error: e.message });
}
};
