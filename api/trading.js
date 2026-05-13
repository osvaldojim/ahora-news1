module.exports = function(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.status(200).json({
recs: [
{ ticker: ‘NVDA’, nombre: ‘NVIDIA Corp’, accion: ‘COMPRAR’, precio: ‘$875’, razon: ‘Fuerte demanda de chips IA en mercados globales’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘AAPL’, nombre: ‘Apple Inc’, accion: ‘COMPRAR’, precio: ‘$182’, razon: ‘Ciclo de actualizacion iPhone con IA integrada’, confianza: ‘Alta’, color: ‘#007a3d’ },
{ ticker: ‘JPM’, nombre: ‘JPMorgan Chase’, accion: ‘NEUTRAL’, precio: ‘$195’, razon: ‘Resultados solidos pero presion en tasas’, confianza: ‘Media’, color: ‘#e07b00’ },
{ ticker: ‘XOM’, nombre: ‘ExxonMobil’, accion: ‘COMPRAR’, precio: ‘$118’, razon: ‘Precios del petroleo al alza por tensiones’, confianza: ‘Media’, color: ‘#007a3d’ }
],
source: ‘static’
});
};
