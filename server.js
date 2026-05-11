const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/ping', (req, res) => res.json({ status: 'alive', ts: Date.now() }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/inspire', async (req, res) => {
  const { query } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are the soul of Makhijha Travels — a poetic, deeply intuitive travel oracle.
Search real travel magazines (Condé Nast Traveler, National Geographic Travel, Travel+Leisure, Lonely Planet, Vogue Travel) for content about the destination or emotion the user is feeling, then weave those real abstracts into an emotionally resonant narrative.

Return ONLY valid JSON, no markdown:
{
  "headline": "4-8 word poetic headline",
  "emotion_match": "one word",
  "magazine_pulls": [
    { "source": "magazine name", "abstract": "2-3 sentence real insight from that magazine" },
    { "source": "magazine name", "abstract": "..." },
    { "source": "magazine name", "abstract": "..." }
  ],
  "narrative": "150-200 word cinematic present-tense narrative. Second person. Sensory. Put them INSIDE the destination.",
  "best_time": "month range",
  "vibe_tags": ["tag1","tag2","tag3","tag4"],
  "package_nudge": "one gentle non-salesy booking nudge line",
  "destination_key": "one of: santorini,maldives,kyoto,morocco,dubai,coorg,bali,europe,japan,iceland,beach,mountains,paris,swiss",
  "theme": {
    "accent": "#hexcolor soul color of destination",
    "bg_dark": "#hexcolor deep bg tinted to destination"
  }
}`,
      messages: [{ role: 'user', content: `User said: "${query}"\nSearch magazines and create ultimate personalised travel inspiration.` }]
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        res.write(`data: ${JSON.stringify({ type: 'searching', message: 'Scanning world travel magazines...' })}\n\n`);
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
      }
    }
    try {
      const m = fullText.match(/\{[\s\S]*\}/);
      if (m) res.write(`data: ${JSON.stringify({ type: 'complete', data: JSON.parse(m[0]) })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'complete', data: { narrative: fullText, headline: 'Your escape awaits', magazine_pulls: [], vibe_tags: [] } })}\n\n`);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
app.listen(PORT, () => {
  console.log(`Makhijha Travels running on port ${PORT}`);
  setInterval(() => {
    const url = `${RENDER_URL}/ping`;
    const client = url.startsWith('https') ? https : http;
    client.get(url, (r) => console.log(`Keep-alive: ${r.statusCode}`)).on('error', () => {});
  }, 14 * 60 * 1000);
});
