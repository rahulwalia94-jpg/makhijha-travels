const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Stream magazine abstracts + emotional travel narrative via Claude + web search
app.post('/api/inspire', async (req, res) => {
  const { emotion, destination, query } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search'
        }
      ],
      system: `You are the soul of Makhijha Travels — a poetic, deeply intuitive travel oracle.
Your role: search real travel magazines (Condé Nast Traveler, National Geographic Travel, Travel+Leisure, Lonely Planet, Vogue Travel) for content about the destination or emotion the user is feeling, then weave those real abstracts and insights into an emotionally resonant, almost hypnotic travel narrative.

FORMAT YOUR RESPONSE AS JSON with this exact structure (no markdown, pure JSON):
{
  "headline": "a 4-8 word poetic headline",
  "emotion_match": "one word describing the emotional resonance",
  "magazine_pulls": [
    { "source": "magazine name", "abstract": "2-3 sentence real insight or quote-style abstract from that magazine about this destination/emotion" },
    { "source": "magazine name", "abstract": "..." }
  ],
  "narrative": "A 150-200 word flowing, cinematic, present-tense narrative that puts the user INSIDE the destination. Second person. Sensory. Almost dream-like. Make them feel they are already there.",
  "best_time": "month range",
  "vibe_tags": ["tag1", "tag2", "tag3"],
  "package_nudge": "one gentle, non-salesy line that makes them want to book",
  "destination_key": "one word lowercase key matching the primary destination — must be one of: santorini, maldives, kyoto, morocco, dubai, coorg, bali, europe, japan, iceland, beach, mountains, paris, newzealand, swiss. Pick the closest match.",
  "theme": {
    "accent": "#hexcolor — the soul color of this destination (e.g. Santorini = #4A90D9 deep aegean blue, Maldives = #00B4CC turquoise, Kyoto = #C084A0 sakura pink, Morocco = #E8922A spice orange, Dubai = #D4A840 gold sand, Coorg = #5A8A3C forest green, Bali = #E07B4A terracotta, Iceland = #7AB8D4 glacier blue)",
    "accent2": "#hexcolor — secondary complementary color",
    "bg_dark": "#hexcolor — deep background color tinted toward destination palette",
    "bg_mid": "#hexcolor — mid background color",
    "overlay_opacity": "0.0 to 0.4 — how much to tint the hero image with accent color",
    "font_mood": "one of: sharp, flowing, ancient, modern, warm, cold"
  }
}

Always search first. Pull real insights. Make it feel like the user is reading the most expensive travel magazine in the world, curated just for them.`,
      messages: [
        {
          role: 'user',
          content: `User's emotional state: "${emotion || 'exhausted and needing escape'}"
Destination interest: "${destination || 'anywhere beautiful'}"
What they typed: "${query || 'I need to go somewhere'}"

Search travel magazines for insights about this destination/mood and create the ultimate personalised travel inspiration.`
        }
      ]
    });

    let fullText = '';
    let searchDone = false;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block?.type === 'tool_use') {
          res.write(`data: ${JSON.stringify({ type: 'searching', message: 'Scanning Condé Nast, National Geographic, Travel+Leisure...' })}\n\n`);
        }
      }
      if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
          // Stream partial text for feel
          res.write(`data: ${JSON.stringify({ type: 'streaming', chunk: event.delta.text })}\n\n`);
        }
      }
    }

    // Parse and send final
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        res.write(`data: ${JSON.stringify({ type: 'complete', data: parsed })}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'complete', data: { narrative: fullText, headline: 'Your escape awaits', magazine_pulls: [], vibe_tags: [] } })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// Quick destination cards
app.post('/api/destinations', async (req, res) => {
  const { mood } = req.body;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `For someone feeling "${mood}", suggest 6 travel destinations. Return ONLY valid JSON array:
[{"name":"City","country":"Country","tagline":"5 word poetic tagline","price":"₹X,XX,000","nights":7,"color1":"#hexcode","color2":"#hexcode","emoji":"single emoji representing destination"}]
Use rich gradient colors. Be poetic with taglines.`
      }]
    });
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    res.json({ destinations: jsonMatch ? JSON.parse(jsonMatch[0]) : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Makhijha Travels running on port ${PORT}`));
