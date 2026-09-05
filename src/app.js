import express from 'express';
import { webhookRouter } from './routes/webhook.js';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'sup-cape-town-whatsapp-assistant' }));
app.use(webhookRouter);