# Bakaro Sommelier IA — Deploy del Proxy

Il menu HTML non può chiamare direttamente l’API Anthropic perché la chiave
sarebbe visibile a chiunque aprisse il sorgente. Questo proxy gira su
**Cloudflare Workers** (gratuito fino a 100.000 richieste/giorno) e aggiunge
la chiave in modo sicuro lato server.

-----

## Prerequisiti

- Account Cloudflare gratuito → <https://cloudflare.com>
- Node.js installato (versione 18 o superiore)
- Una chiave API Anthropic → <https://console.anthropic.com>

-----

## Step 1 — Installa Wrangler

```bash
npm install -g wrangler
```

-----

## Step 2 — Entra nella cartella del proxy

```bash
cd bakaro-proxy
npm install
```

-----

## Step 3 — Login su Cloudflare

```bash
wrangler login
```

Si apre il browser. Autorizza l’accesso.

-----

## Step 4 — Aggiungi la chiave API come secret

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Incolla la tua chiave Anthropic quando richiesto (inizia con `sk-ant-...`).
La chiave viene cifrata su Cloudflare e non è mai visibile nel codice.

-----

## Step 5 — Deploy

```bash
wrangler deploy
```

Al termine vedrai qualcosa come:

```
Published bakaro-sommelier-proxy (0.5 sec)
  https://bakaro-sommelier-proxy.TUO-ACCOUNT.workers.dev
```

Copia questo URL — ti serve nel passo successivo.

-----

## Step 6 — Aggiorna il menu HTML

Nel file `index.html`, cerca questa riga nella funzione `fetchPairing`:

```javascript
var PROXY_URL = 'https://bakaro-sommelier-proxy.TUO-ACCOUNT.workers.dev';
```

Sostituisci `TUO-ACCOUNT` con il tuo sottodominio Cloudflare.

-----

## Step 7 — Aggiorna l’origine autorizzata nel worker

Nel file `worker.js`, la riga:

```javascript
const ALLOWED_ORIGINS = [
  'https://rua56.github.io',
  ...
];
```

Verifica che il dominio del tuo sito GitHub Pages sia corretto, poi
ri-deploya con `wrangler deploy`.

-----

## Test locale

Per testare il worker in locale prima del deploy:

```bash
wrangler dev
```

Il worker gira su `http://localhost:8787`. Puoi aprire `index.html`
direttamente nel browser — la funzione `openSommelierIA` punterà
automaticamente al localhost se sei in sviluppo.

-----

## Costi

|Piano       |Richieste/giorno|Prezzo    |
|------------|----------------|----------|
|Free Workers|100.000         |**Gratis**|
|Paid Workers|illimitate      |$5/mese   |

Un ristorante tipico non supererà mai le 100.000 richieste/giorno.

-----

## Sicurezza

- La chiave API Anthropic non è mai nel codice né nel browser
- Solo le origini in `ALLOWED_ORIGINS` possono usare il proxy
- Il prompt viene costruito lato server (nessun prompt injection dal browser)
- Lunghezza massima dell’input: 200 caratteri per il nome, 400 per la descrizione
- Numero massimo di token nella risposta: 600