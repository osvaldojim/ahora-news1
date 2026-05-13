export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET’);
res.setHeader(‘Cache-Control’, ‘s-maxage=3600, stale-while-revalidate=7200’);

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
return res.status(500).json({ error: ‘ANTHROPIC_API_KEY not configured’ });
}

const today = new Date().toLocaleDateString(‘es-DO’, {
weekday: ‘long’, year: ‘numeric’, month: ‘long’, day: ‘numeric’
});

try {
const response = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
‘x-api-key’: ANTHROPIC_KEY,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify({
model: ‘claude-haiku-4-5-20251001’,
max_tokens: 800,
messages: [{
role: ‘user’,
content: ⁠ Hoy es ${today}. Dame exactamente 4 recomendaciones de acciones para comprar hoy en la bolsa de EE.UU. Responde SOLO con JSON valido, sin markdown, sin texto adicional. Formato: [{"ticker":"AAPL","nombre":"Apple Inc","accion":"COMPRAR","precio":"$182","razon":"Razon de maximo 12 palabras","confianza":"Alta","color":"#007a3d"},{"ticker":"TSLA","nombre":"Tesla Inc","accion":"NEUTRAL","precio":"$245","razon":"Razon de maximo 12 palabras","confianza":"Media","color":"#e07b00"}]. Colores: #007a3d comprar, #cc0000 vender, #e07b00 neutral. Mix de tech, energia, salud, finanzas. ⁠
}]
})
});


⁠ const data = await response.json();
const text = (data.content && data.content[0] && data.content[0].text) || '[]';
const clean = text.replace(/ ⁠json|⁠ /g, '').trim();
const recs = JSON.parse(clean);

return res.status(200).json({ recs, generated: new Date().toISOString() });
 ⁠

} catch (error) {
// Fallback con datos estáticos si falla la IA
return res.status(200).json({
recs: [
{ ticker: ‘NVDA’, nombre: ‘NVIDIA Corp’, accion: ‘COMPRAR’, precio: ‘$875’, razon: ‘Fuerte demanda de chips IA en mercados globales’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘AAPL’, nombre: ‘Apple Inc’, accion: ‘COMPRAR’, precio: ‘$182’, razon: ‘Ciclo de actualización iPhone con IA integrada’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘JPM’, nombre: ‘JPMorgan Chase’, accion: ‘NEUTRAL’, precio: ‘$195’, razon: ‘Resultados sólidos pero presión en tasas de interés’, confianza: ‘Media’, color: ‘#e07b00’ },
{ ticker: ‘XOM’, nombre: ‘ExxonMobil’, accion: ‘COMPRAR’, precio: ‘$118’, razon: ‘Precios del petróleo al alza por tensiones en Medio Oriente’, confianza: ‘Media’, color: ‘#007a3d’ }
],
generated: new Date().toISOString()
});
}
}
