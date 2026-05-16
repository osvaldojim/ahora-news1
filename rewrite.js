export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'No API key' });

  const { title, description, content } = req.body || {};
  if (!title) return res.status(400).json({ error: 'No title provided' });

  try {
    const prompt = `Eres periodista estrella de AhoraNews, el medio más leído de República Dominicana.

NOTICIA ORIGINAL:
Título: ${title}
Resumen: ${description || ''}
Contenido: ${content || description || ''}

TU MISIÓN - escribe un artículo periodístico COMPLETO:

1. TÍTULO: Impactante y dominicano. Usa "Se armó", "Brutal", "Tremendo", "Agárrate", "Fuácata" si aplica. Máx 80 caracteres. DEBE ser diferente al original.

2. DESCRIPCIÓN: 2 oraciones directas como contándole el chisme a un amigo dominicano.

3. CUERPO: 6 párrafos completos en español dominicano:
- Párrafo 1: El hecho principal. Quién, qué, cuándo, dónde.
- Párrafo 2: Contexto. ¿Por qué pasó? ¿Antecedentes?
- Párrafo 3: Impacto. ¿Cómo afecta a la gente?
- Párrafo 4: Reacción. ¿Qué dicen expertos o afectados?
- Párrafo 5: Relación con RD. ¿Cómo impacta a los dominicanos?
- Párrafo 6: ¿Qué viene ahora?
Cada párrafo mínimo 60 palabras. Total mínimo 400 palabras.

4. isViral: true si es sobre famosos, crímenes, récords, deportes, política polémica.

Responde SOLO en JSON sin markdown:
{"title":"aquí","description":"aquí","body":"párrafo1\\n\\npárrafo2\\n\\npárrafo3\\n\\npárrafo4\\n\\npárrafo5\\n\\npárrafo6","isViral":false}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    let parsed = {};
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      // Manual extraction if JSON fails
      const tMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
      const dMatch = text.match(/"description"\s*:\s*"([^"]+)"/);
      const bMatch = text.match(/"body"\s*:\s*"([\s\S]+?)(?:"\s*,\s*"isViral|"\s*\})/);
      parsed = {
        title: tMatch?.[1] || title,
        description: dMatch?.[1] || description,
        body: bMatch?.[1]?.replace(/\\n/g, '\n') || description,
        isViral: false
      };
    }

    return res.status(200).json({
      title: parsed.title || title,
      description: parsed.description || description,
      body: parsed.body || description,
      isViral: parsed.isViral || false
    });

  } catch (err) {
    console.error('Rewrite error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
