import { Router } from 'express';
import { config } from '../config.js';
import { handleIncomingMessage } from '../services/assistant.js';

export const webhookRouter = Router();

webhookRouter.use((req, _res, next) => {
  console.log(`[Webhook] ${req.method} ${req.originalUrl} received`);
  next();
});

webhookRouter.get('/webhook', (req, res) => {
  const valid = req.query['hub.verify_token'] === config.whatsapp.verifyToken;
  if (valid) return res.status(200).send(req.query['hub.challenge']);
  return res.sendStatus(403);
});

webhookRouter.post('/webhook', (req, res) => {
  console.log('[Webhook] Full payload:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
  processWebhook(req.body).catch((error) => {
    console.error('[Webhook] Processing failed:', error);
    console.error('[Webhook] Processing error stack:', error.stack);
  });
});

async function processWebhook(body) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        if (message.type !== 'text' || !message.from || !message.id) continue;
        console.log('[Webhook] Sender phone number:', message.from);
        console.log('[Webhook] Message text:', message.text.body);
        await handleIncomingMessage({ from: message.from, text: message.text.body, messageId: message.id });
      }
    }
  }
}