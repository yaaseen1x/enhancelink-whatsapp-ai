import knowledge from '../../knowledge/business.json' with { type: 'json' };
import { answerFaq, understandMessage } from './gemini.js';
import { createCalendarEvent, updateCalendarEvent } from './calendar.js';
import { sendWhatsAppText } from './whatsapp.js';
import { BookingLimitError, supabaseService } from './supabase.js';
import { bookingPeople, emptyBooking, firstMissingField, formatBooking, MAX_PEOPLE_PER_SLOT, mergeBooking, normalizeBookingDate, parseBookingModification, parseFieldAnswer } from '../utils/booking.js';

const sessions = new Map();
const modificationSessions = new Map();

function deleteSession(from, reason) {
  const deleted = sessions.delete(from);
  console.log(`[Booking] Session deleted for ${from} (${reason}; existed: ${deleted})`);
}

export function hasBookingSession(from) {
  return sessions.has(from) || modificationSessions.has(from);
}

export async function handleIncomingMessage({ from, text, messageId }, dependencies = {}) {
  const saveMessage = dependencies.saveMessage || supabaseService.saveMessage;
  const saveBooking = dependencies.saveBooking || supabaseService.saveBooking;
  const understand = dependencies.understandMessage || understandMessage;
  const createEvent = dependencies.createCalendarEvent || createCalendarEvent;
  const updateEvent = dependencies.updateCalendarEvent || updateCalendarEvent;
  const findBooking = dependencies.findBooking || supabaseService.findBooking;
  const updateBooking = dependencies.updateBooking || supabaseService.updateBooking;
  const saveBookingAudit = dependencies.saveBookingAudit || supabaseService.saveBookingAudit;
  const saveCalendarEventId = dependencies.saveCalendarEventId || supabaseService.saveCalendarEventId;
  const sendText = dependencies.sendWhatsAppText || sendWhatsAppText;
  const services = { saveMessage, sendText };
  await saveMessage({ whatsapp_message_id: messageId, phone_number: from, direction: 'inbound', message_type: 'text', body: text });
  if (/cancel|start over|reset/i.test(text)) {
    deleteSession(from, 'cancelled');
    modificationSessions.delete(from);
    return sendAndStore(from, 'Booking cancelled. How can I help you today?', services);
  }
  const modification = parseBookingModification(text);
  const explicitModification = /\b(change|modify|update)\b/i.test(text);
  if (modificationSessions.has(from) || modification?.reference || explicitModification) {
    const result = await handleModification({ from, modification, findBooking, updateBooking, updateEvent, saveBookingAudit, sendText, saveMessage });
    if (result) return result;
  }
  const existingSession = sessions.get(from);
  const session = existingSession || { booking: emptyBooking() };
  if (!existingSession) console.log(`[Booking] Session created for ${from}`);
  const missingBeforeMessage = firstMissingField(session.booking);
  const understood = await understand(text);
  console.log('Understood:', understood);
  if (understood.intent !== 'booking' && (!sessions.has(from) || isFaqQuestion(text))) return sendAndStore(from, await answerFaq(text), services);
  const fieldAnswer = Object.keys(understood.updates || {}).length > 0 ? {} : parseFieldAnswer(missingBeforeMessage, text);
  session.booking = mergeBooking(session.booking, { ...understood.updates, ...fieldAnswer });
  if (session.booking.date) session.booking.date = normalizeBookingDate(session.booking.date) || session.booking.date;
  console.log('Booking after merge:', session.booking);
  sessions.set(from, session);
  console.log(`[Booking] Session updated for ${from}`);
  const missing = firstMissingField(session.booking);
  if (missing) {
    const questions = { name: 'What name should I put on the booking?', date: 'What date would you like to visit? Please use YYYY-MM-DD.', time: 'What time would you prefer?', adults: 'How many adults are coming?', children: 'How many children are coming? Reply 0 if none.' };
    return sendAndStore(from, questions[missing], services);
  }
  const booking = { ...session.booking, phone_number: from, status: 'confirmed' };
  let saved;
  try {
    saved = await saveBooking(booking);
    console.log(`[Booking] Booking saved for ${from}`);
    deleteSession(from, 'booking saved');
  } catch (error) {
    if (!(error instanceof BookingLimitError)) throw error;
    deleteSession(from, 'booking limit');
    const reply = `Sorry, this session is fully booked.\n\nRemaining capacity: ${error.remainingCapacity}`;
    return sendAndStore(from, reply, services);
  }
  let calendarEvent = null;
  try {
    calendarEvent = await createEvent(booking, from);
    if (calendarEvent) console.log(`[Booking] Calendar created for ${from}`);
    if (calendarEvent?.id && saved?.id) await saveCalendarEventId(saved.id, calendarEvent.id);
  } catch (error) {
    console.error(`[Booking] Calendar failed for ${from}:`, error.message);
  }
  const reply = `Thanks, ${booking.name}! Your SUP Cape Town booking request is complete${saved?.booking_reference ? ` (${saved.booking_reference})` : ''}:\n\n${formatBooking(booking)}\n\n${knowledge.confirmationNote}${calendarEvent ? '\nYour calendar booking has been added.' : ''}`;
  const sent = await sendAndStore(from, reply, services);
  console.log(`[Booking] Session completed for ${from}`);
  return { saved, calendarEvent, sent };
}

async function sendAndStore(to, body, { saveMessage, sendText }) {
  const sent = await sendText(to, body);
  await saveMessage({ whatsapp_message_id: sent.id, phone_number: to, direction: 'outbound', message_type: 'text', body });
  return sent;
}

async function handleModification({ from, modification, findBooking, updateBooking, updateEvent, saveBookingAudit, sendText, saveMessage }) {
  const pending = modificationSessions.get(from);
  const parsed = modification || { reference: pending?.booking.booking_reference || null, updates: {} };
  const target = pending?.booking || await findBooking({ phoneNumber: from, reference: parsed.reference });
  if (!target) {
    return sendAndStore(from, 'I could not find that booking. Please provide a valid booking reference such as EL-24.', { saveMessage, sendText });
  }
  const updates = parsed.updates;
  if (!Object.keys(updates).length) {
    modificationSessions.set(from, { booking: target });
    console.log(`[Booking] Modification session created for ${from} (${target.booking_reference || 'latest booking'})`);
    return sendAndStore(from, 'What would you like to change on this booking?', { saveMessage, sendText });
  }
  const updated = { ...target };
  for (const field of ['date', 'time']) if (updates[field] !== undefined) updated[field] = updates[field];
  for (const field of ['adults', 'children']) {
    if (updates[field] === undefined) continue;
    updated[field] = typeof updates[field] === 'object' ? Number(target[field]) + updates[field].add : updates[field];
  }
  if (updated.date) updated.date = normalizeBookingDate(updated.date);
  if (!updated.date || bookingPeople(updated) > MAX_PEOPLE_PER_SLOT) {
    modificationSessions.delete(from);
    return sendAndStore(from, 'This change would exceed the 30-person limit or contains an invalid date.', { saveMessage, sendText });
  }
  const saved = await updateBooking(target.id, { date: updated.date, time: updated.time, adults: updated.adults, children: updated.children });
  await saveBookingAudit({ booking_id: target.id, booking_reference: target.booking_reference, phone_number: from, original_booking: target, updated_booking: saved || updated });
  if (target.calendar_event_id) {
    try {
      await updateEvent(target.calendar_event_id, saved || updated, from);
      console.log(`[Booking] Calendar created for modification ${from}`);
    } catch (error) {
      console.error(`[Booking] Calendar failed for modification ${from}:`, error.message);
    }
  }
  modificationSessions.delete(from);
  console.log(`[Booking] Session completed for modification ${from}`);
  const finalBooking = saved || updated;
  return sendAndStore(from, `Your booking ${target.booking_reference || ''} has been updated.\n\n${formatBooking(finalBooking)}`, { saveMessage, sendText });
}
function isFaqQuestion(text) {
  return /price|pricing|cost|rate|how much|hour|open|when|where|location|address|park|parking|group|team|many people|weather|lesson|session/i.test(text);
}