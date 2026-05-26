const express = require('express');
const app = express();

app.use(express.json());

const VERIFY_TOKEN  = process.env.VERIFY_TOKEN  || 'studyhive2026';
const WA_TOKEN      = process.env.WA_TOKEN;
const PHONE_ID      = process.env.PHONE_ID;
const GROQ_KEY      = process.env.GROQ_API_KEY;

/* ── Webhook verification ── */
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified ✅');
    res.status(200).send(challenge);
  } else {
    console.log('Verification failed ❌');
    res.sendStatus(403);
  }
});

/* ── Incoming messages ── */
app.post('/webhook', async (req, res) => {
  /* Always respond 200 immediately so Meta doesn't retry */
  res.sendStatus(200);

  try {
    const entry   = req.body.entry?.[0];
    const change  = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const from = message.from;
    const text = message.text.body;

    console.log(`📩 From ${from}: ${text}`);

    /* ── Ask Groq ── */
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are StudyHive 🐝 — a friendly AI homework assistant on WhatsApp.
You help students with ALL subjects: Maths, Science, English, History, Geography, Physics, Chemistry, Biology, Economics, Accounting, IT and more.
Tone: encouraging, clear, patient. Always show steps so students learn, not just copy.
Keep answers concise but complete. Use emojis sparingly.
If asked something unrelated to studying, politely redirect to homework help.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens:  1024,
      }),
    });

    if (!groqRes.ok) throw new Error(`Groq error: ${groqRes.status}`);
    const groqData = await groqRes.json();
    const answer   = groqData.choices?.[0]?.message?.content || "Sorry, I couldn't process that. Please try again 🙏";

    console.log(`🤖 Answer: ${answer.slice(0, 80)}...`);

    /* ── Reply on WhatsApp ── */
    const waRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                from,
        type:              'text',
        text:              { body: answer },
      }),
    });

    if (!waRes.ok) {
      const err = await waRes.text();
      console.error('WhatsApp send error:', err);
    } else {
      console.log(`✅ Reply sent to ${from}`);
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

/* ── Health check ── */
app.get('/', (req, res) => res.send('StudyHive is running 🐝'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`StudyHive running on port ${PORT}`));
