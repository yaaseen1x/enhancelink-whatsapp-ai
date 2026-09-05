import { config } from '../config.js';

export async function sendWhatsAppText(to, body) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    console.warn('WhatsApp is not configured; outgoing message:', { to, body });
    return { id: `local-${Date.now()}` };
  }
  const response = await fetch(`https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } })
  });
  if (!response.ok) throw new Error(`WhatsApp API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { id: data.messages?.[0]?.id || null, raw: data };
}