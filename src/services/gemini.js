import { GoogleGenerativeAI } from '@google/generative-ai';
import knowledge from '../../knowledge/business.json' with { type: 'json' };
import { config } from '../config.js';
import { parseSimpleBookingText } from '../utils/booking.js';

const model = config.gemini.apiKey ? new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: config.gemini.model }) : null;

export async function understandMessage(text) {
  const fallback = { intent: /book|booking|reserve|reservation/i.test(text) ? 'booking' : 'faq', updates: parseSimpleBookingText(text) };
  if (!model) return fallback;
  const prompt = `
You are extracting booking information for ${knowledge.businessName}.

Return ONLY valid JSON.

Schema:
{
"intent": "booking" | "faq" | "other",
"updates": {
"name": string,
"date": string,
"time": string,
"adults": number,
"children": number
}
}

Rules:
- Extract only the customer's actual name.
- Never use the entire message as the name.
- If the user says "the booking is for Yaaseen", then name = "Yaaseen".
- If no name is provided, omit the name field.
- adults and children must be numbers.
- Return only fields that are clearly present.
- Detect booking intent whenever the user is trying to make a reservation.

User message:
${text}
`;
  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text().replace(/^```json\s*|\s*```$/g, '').trim());
    console.log('Gemini extracted:', parsed);
    return { intent: parsed.intent || fallback.intent, updates: { ...fallback.updates, ...(parsed.updates || {}) } };
  } catch (error) {
    console.error('Gemini understanding failed; using local parser:', error.message);
    return fallback;
  }
}

export async function answerFaq(text) {
  if (!model) return localFaq(text);
  const prompt = `Answer the user as a concise WhatsApp assistant for ${knowledge.businessName}. Use only this knowledge: ${JSON.stringify(knowledge)}. If the answer is not in the knowledge, say a team member will confirm it. User: ${text}`;
  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini FAQ failed; using local FAQ:', error.message);
    return localFaq(text);
  }
}

function localFaq(text) {
  const value = text.toLowerCase();
  if (/price|cost|rate|how much/.test(value)) return knowledge.pricing;
  if (/hour|open|when/.test(value)) return knowledge.hours;
  if (/where|location|address/.test(value)) return knowledge.location;
  if (/park|parking|car/.test(value)) return knowledge.parking;
  if (/group|team|many people/.test(value)) return knowledge.groupBookings;
  return 'I can help with pricing, hours, location, parking, group bookings, or a reservation. What would you like to know?';
}