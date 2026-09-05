import knowledge from '../../knowledge/business.json' with { type: 'json' };
import { answerFaq, understandMessage } from './gemini.js';
import { createCalendarEvent } from './calendar.js';
import { sendWhatsAppText } from './whatsapp.js';
import { supabaseService } from './supabase.js';
import { emptyBooking, firstMissingField, formatBooking, mergeBooking, parseFieldAnswer } from '../utils/booking.js';

const sessions = new Map();

export async function handleIncomingMessage({ from, text, messageId }) {
  await supabaseService.saveMessage({ whatsapp_message_id: messageId, phone_number: from, direction: 'inbound', message_type: 'text', body: text });
  if (/cancel|start over|reset/i.test(text)) {
    sessions.delete(from);
    return sendAndStore(from, 'Booking cancelled. How can I help you today?');
  }
  const session = sessions.get(from) || { booking: emptyBooking() };
  const missingBeforeMessage = firstMissingField(session.booking);
  const understood = await understandMessage(text);
  console.log('Understood:', understood);
  if (understood.intent !== 'booking' && (!sessions.has(from) || isFaqQuestion(text))) return sendAndStore(from, await answerFaq(text));
  const fieldAnswer = Object.keys(understood.updates || {}).length > 0 ? {} : parseFieldAnswer(missingBeforeMessage, text);
  session.booking = mergeBooking(session.booking, { ...understood.updates, ...fieldAnswer });
  console.log('Booking after merge:', session.booking);
  sessions.set(from, session);
  const missing = firstMissingField(session.booking);
  if (missing) {
    const questions = { name: 'What name should I put on the booking?', date: 'What date would you like to visit? Please use YYYY-MM-DD.', time: 'What time would you prefer?', adults: 'How many adults are coming?', children: 'How many children are coming? Reply 0 if none.' };
    return sendAndStore(from, questions[missing]);
  }
  const booking = { ...session.booking, phone_number: from, status: 'confirmed' };
  const saved = await supabaseService.saveBooking(booking);
  let calendarEvent = null;
  try { calendarEvent = await createCalendarEvent(booking, from); } catch (error) { console.error('Calendar event failed:', error.message); }
  const reply = `Thanks, ${booking.name}! Your SUP Cape Town booking request is complete:\n\n${formatBooking(booking)}\n\n${knowledge.confirmationNote}${calendarEvent ? '\nYour calendar booking has been added.' : ''}`;
  const sent = await sendAndStore(from, reply);
  sessions.delete(from);
  return { saved, calendarEvent, sent };
}

async function sendAndStore(to, body) {
  const sent = await sendWhatsAppText(to, body);
  await supabaseService.saveMessage({ whatsapp_message_id: sent.id, phone_number: to, direction: 'outbound', message_type: 'text', body });
  return sent;
}

function isFaqQuestion(text) {
  return /price|pricing|cost|rate|how much|hour|open|when|where|location|address|park|parking|group|team|many people|weather|lesson|session/i.test(text);
}