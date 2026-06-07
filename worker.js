/**
 * Bakaro Sommelier IA — Cloudflare Worker Proxy
 *
 * Riceve le richieste dal menu HTML, aggiunge la chiave API Anthropic
 * e le forwarda in modo sicuro. La chiave non è mai esposta al browser.
 */

// Origini autorizzate — aggiungi il tuo dominio GitHub Pages
const ALLOWED_ORIGINS = [
  'https://rua56.github.io',
  'http://localhost',        // sviluppo locale
  'http://127.0.0.1',
];

// Limiti di sicurezza
const MAX_PROMPT_LENGTH = 4000;   // caratteri max nel prompt
const MAX_TOKENS        = 600;    // token max nella risposta
const ALLOWED_MODEL     = 'claude-sonnet-4-20250514';

export default {
  async fetch(request, env) {

    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, request);
    }

    // ── Solo POST ─────────────────────────────────────────────────────────────
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, request);
    }

    // ── Verifica origine ──────────────────────────────────────────────────────
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, request);
    }

    // ── Leggi e valida il body ────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, request);
    }

    // Accetta solo la struttura che il menu invia
    const { cicchetto, descrizione } = body;
    if (!cicchetto || typeof cicchetto !== 'string') {
      return corsResponse(JSON.stringify({ error: 'Missing cicchetto' }), 400, request);
    }

    // Sanifica input
    const safeCicchetto   = cicchetto.slice(0, 200).replace(/[<>]/g, '');
    const safeDescrizione = (descrizione || '').slice(0, 400).replace(/[<>]/g, '');

    // ── Costruisci il prompt lato server ─────────────────────────────────────
    // Il catalogo vini è qui nel worker, NON nel browser
    const WINE_CATALOG = getWineCatalog();

    const wineList = WINE_CATALOG.map(w =>
      `[${w.t}] ${w.n} — €${w.p}`
    ).join('\n');

    const prompt =
      `Sei il sommelier elegante e appassionato di Al Bakaro, cicchetteria di Gorizia al confine ` +
      `tra Italia e Slovenia. Il cliente ha scelto questo cicchetto:\n\n` +
      `«${safeCicchetto}»` + (safeDescrizione ? ` — ${safeDescrizione}` : '') + `\n\n` +
      `Dalla nostra carta scegli esattamente 3 vini che si abbinano meglio, privilegiando i vini ` +
      `al calice se appropriati. Scegli SOLO vini presenti in questa lista:\n\n` +
      wineList + `\n\n` +
      `Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, senza markdown. Formato:\n` +
      `{"intro":"frase introduttiva breve in italiano, tono caldo e sommelier","vini":[` +
      `{"nome":"nome esatto dalla lista","prezzo":"prezzo esatto","tipo":"calice o bottiglia",` +
      `"perche":"spiegazione dell'abbinamento in 1-2 frasi, tono sommelier, in italiano"}]}`;

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return corsResponse(JSON.stringify({ error: 'Prompt too long' }), 400, request);
    }

    // ── Chiama l'API Anthropic ────────────────────────────────────────────────
    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,   // secret nel worker
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      ALLOWED_MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (e) {
      return corsResponse(JSON.stringify({ error: 'Upstream error' }), 502, request);
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic error:', anthropicRes.status, errText);
      return corsResponse(JSON.stringify({ error: 'API error', status: anthropicRes.status }), 502, request);
    }

    const data = await anthropicRes.json();
    const raw  = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();

    // Valida che la risposta sia JSON prima di ritornare al browser
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid model response' }), 502, request);
    }

    return corsResponse(JSON.stringify(parsed), 200, request);
  }
};

// ── Helper CORS ───────────────────────────────────────────────────────────────
function corsResponse(body, status, request) {
  const origin = request?.headers?.get('Origin') || '*';
  const headers = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':      '86400',
  };
  return new Response(body, { status, headers });
}

// ── Catalogo vini (mantenuto qui, non nel browser) ────────────────────────────
function getWineCatalog() {
  return [
    // ── Bollicine al calice ──
    {n:'Ferrari Maximum',p:'6.00',t:'calice'},
    {n:'Ribolla Gialla Spumantizzata — Tenuta Stella',p:'5.00',t:'calice'},
    {n:'Rosé — Oltrenero',p:'6.00',t:'calice'},
    // ── Bianchi al calice ──
    {n:'Chardonnay — Toros',p:'5.50',t:'calice'},
    {n:'Ribolla Gialla — Sturm',p:'5.00',t:'calice'},
    {n:'Malvasia — Sturm',p:'5.00',t:'calice'},
    {n:'Kerner — Strasserhoff',p:'4.50',t:'calice'},
    {n:'Vitovska — Bajta',p:'4.50',t:'calice'},
    {n:'Pinot Bianco — Toros',p:'6.00',t:'calice'},
    {n:'Collio Bianco — Toros',p:'5.50',t:'calice'},
    {n:'Sauvignon — Toros',p:'5.50',t:'calice'},
    {n:'Friulano — Toros',p:'5.50',t:'calice'},
    {n:'Traminer — Tiefenbrunner',p:'5.50',t:'calice'},
    {n:'Müller Thurgau — Tiefenbrunner',p:'5.00',t:'calice'},
    {n:'Gewürztraminer — Tiefenbrunner',p:'5.50',t:'calice'},
    {n:'Pinot Grigio — Tiefenbrunner',p:'5.00',t:'calice'},
    // ── Rossi al calice ──
    {n:'Merlot — Bajta',p:'4.50',t:'calice'},
    {n:'Refosco dal Peduncolo Rosso — Toros',p:'5.50',t:'calice'},
    {n:'Cabernet Sauvignon — Toros',p:'5.50',t:'calice'},
    {n:'Teroldego — Tiefenbrunner',p:'5.00',t:'calice'},
    {n:'Pinot Nero — Tiefenbrunner',p:'5.50',t:'calice'},
    {n:'Lagrein — Tiefenbrunner',p:'5.00',t:'calice'},
    // ── Bollicine in bottiglia ──
    {n:'Prosecco L\'Infedele — Astoria',p:'24',t:'bottiglia'},
    {n:'Ferrari Maximum',p:'40',t:'bottiglia'},
    {n:'Ferrari Perlè',p:'60',t:'bottiglia'},
    {n:'Ribolla Gialla Spumantizzata — Tenuta Stella',p:'35',t:'bottiglia'},
    {n:'Rosé — Oltrenero',p:'40',t:'bottiglia'},
    {n:'Trentodoc — Altemasi',p:'40',t:'bottiglia'},
    {n:'Amadeus — Castello di Spessa',p:'50',t:'bottiglia'},
    {n:'Franciacorta Cuvée Prestige — Ca\' del Bosco',p:'60',t:'bottiglia'},
    {n:'Franciacorta Dosage Zero — Ca\' del Bosco',p:'80',t:'bottiglia'},
    {n:'Champagne Perrier-Jouet Grand Brut',p:'120',t:'bottiglia'},
    // ── Bianchi in bottiglia ──
    {n:'Pinot Bianco — Toros',p:'29',t:'bottiglia'},
    {n:'Collio Bianco — Toros',p:'35',t:'bottiglia'},
    {n:'Sauvignon — Toros',p:'35',t:'bottiglia'},
    {n:'Friulano — Toros',p:'29',t:'bottiglia'},
    {n:'Ribolla Gialla — Sturm',p:'32',t:'bottiglia'},
    {n:'Malvasia — Sturm',p:'35',t:'bottiglia'},
    {n:'Vitovska — Bajta',p:'32',t:'bottiglia'},
    {n:'Chardonnay — Toros',p:'35',t:'bottiglia'},
    {n:'Traminer — Tiefenbrunner',p:'35',t:'bottiglia'},
    {n:'Gewürztraminer — Tiefenbrunner',p:'35',t:'bottiglia'},
    {n:'Kerner — Strasserhoff',p:'32',t:'bottiglia'},
    // ── Rossi in bottiglia ──
    {n:'Merlot — Bajta',p:'29',t:'bottiglia'},
    {n:'Refosco dal Peduncolo Rosso — Toros',p:'35',t:'bottiglia'},
    {n:'Cabernet Sauvignon — Toros',p:'35',t:'bottiglia'},
    {n:'Teroldego — Tiefenbrunner',p:'35',t:'bottiglia'},
    {n:'Pinot Nero — Tiefenbrunner',p:'38',t:'bottiglia'},
    {n:'Lagrein — Tiefenbrunner',p:'35',t:'bottiglia'},
    {n:'Sassirossi — Masut da Rive',p:'35',t:'bottiglia'},
    {n:'Schiava — Tiefenbrunner',p:'29',t:'bottiglia'},
    {n:'Primitivo di Manduria — Altemura',p:'29',t:'bottiglia'},
    {n:'Malvasia Nera — Paololeo',p:'29',t:'bottiglia'},
    {n:'Chianti Classico — Marchese Antinori',p:'40',t:'bottiglia'},
  ];
}
