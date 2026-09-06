import test from 'node:test';
import assert from 'node:assert/strict';
import { handleIncomingMessage, hasBookingSession } from '../src/services/assistant.js';
import { shouldProcessMessage } from '../src/routes/webhook.js';
import { bookingPeople, calculateRemainingCapacity, canAcceptBooking, emptyBooking, firstMissingField, MAX_PEOPLE_PER_SLOT, mergeBooking, normalizeBookingDate, parseBookingModification, parseFieldAnswer, parseSimpleBookingText } from '../src/utils/booking.js';

test('caps each one-hour time slot at 30 people', () => {
  assert.equal(MAX_PEOPLE_PER_SLOT, 30);
  assert.equal(bookingPeople({ adults: 21, children: 0 }), 21);
  assert.equal(bookingPeople({ adults: 18, children: 2 }), 20);
});

test('calculates remaining capacity for booking requests', () => {
  assert.equal(canAcceptBooking(28, 2), true);
  assert.equal(canAcceptBooking(28, 3), false);
  assert.equal(canAcceptBooking(30, 1), false);
  assert.equal(canAcceptBooking(0, 30), true);
  assert.equal(calculateRemainingCapacity(28), 2);
  assert.equal(calculateRemainingCapacity(30), 0);
});

test('parses booking details from one message', () => {
  const details = parseSimpleBookingText("My name is Sam. 2026-10-12 at 10 am, 2 adults and 1 child");
  assert.equal(details.name, 'Sam');
  assert.equal(details.date, '2026-10-12');
  assert.equal(details.time, '10 AM');
  assert.equal(details.adults, 2);
  assert.equal(details.children, 1);
});

test('normalizes all supported absolute date formats to ISO', () => {
  const dates = {
    '2027-08-01': '2027-08-01',
    '01/08/2027': '2027-08-01',
    '1/8/2027': '2027-08-01',
    '1 August 2027': '2027-08-01',
    '1 Aug 2027': '2027-08-01',
    'August 1 2027': '2027-08-01',
    'Aug 1 2027': '2027-08-01',
    '1st August 2027': '2027-08-01',
    '2nd August 2027': '2027-08-02',
    '3rd August 2027': '2027-08-03',
    '4th August 2027': '2027-08-04',
  };
  for (const [input, expected] of Object.entries(dates)) assert.equal(normalizeBookingDate(input), expected, input);
  assert.equal(parseSimpleBookingText('Book for 1st August 2027').date, '2027-08-01');
});

test('normalizes relative dates using the Johannesburg timezone', () => {
  const now = new Date('2027-08-01T20:30:00.000Z');
  assert.equal(normalizeBookingDate('today', now), '2027-08-01');
  assert.equal(normalizeBookingDate('tomorrow', now), '2027-08-02');
  assert.equal(normalizeBookingDate('next Monday', now), '2027-08-02');
  assert.equal(normalizeBookingDate('next Tuesday', now), '2027-08-03');
  assert.equal(normalizeBookingDate('next Wednesday', now), '2027-08-04');
  assert.equal(normalizeBookingDate('next Thursday', now), '2027-08-05');
  assert.equal(normalizeBookingDate('next Friday', now), '2027-08-06');
  assert.equal(normalizeBookingDate('next Saturday', now), '2027-08-07');
  assert.equal(normalizeBookingDate('next Sunday', now), '2027-08-08');
  assert.equal(parseSimpleBookingText('Book for tomorrow').date, normalizeBookingDate('tomorrow'));
});

test('parses booking modification requests', () => {
  assert.deepEqual(parseBookingModification('Change booking EL-24'), { reference: 'EL-24', updates: {} });
  assert.deepEqual(parseBookingModification('Add another child'), { reference: null, updates: { children: { add: 1 } } });
  assert.deepEqual(parseBookingModification('Change time to 6pm'), { reference: null, updates: { time: '6 PM' } });
  assert.deepEqual(parseBookingModification('Change date to 2 August 2027'), { reference: null, updates: { date: '2027-08-02' } });
  assert.deepEqual(parseBookingModification('Add 2 adults'), { reference: null, updates: { adults: { add: 2 } } });
});

test('modifies a booking and records an audit entry', async () => {
  const updates = [];
  const audits = [];
  const target = { id: 24, booking_reference: 'EL-24', phone_number: '27333', name: 'Sam', date: '2027-08-01', time: '5 PM', adults: 2, children: 1, status: 'confirmed', calendar_event_id: 'event-24' };
  const dependencies = {
    saveMessage: async () => {},
    findBooking: async () => target,
    updateBooking: async (_id, change) => ({ ...target, ...change }),
    saveBookingAudit: async (audit) => audits.push(audit),
    updateCalendarEvent: async () => ({ id: 'event-24' }),
    sendWhatsAppText: async (_to, body) => { updates.push(body); return { id: 'outbound-modification' }; },
  };
  await handleIncomingMessage({ from: '27333', text: 'Change booking EL-24', messageId: 'modify-start' }, dependencies);
  await handleIncomingMessage({ from: '27333', text: 'Add another child', messageId: 'modify-child' }, dependencies);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].original_booking.children, 1);
  assert.equal(audits[0].updated_booking.children, 2);
  assert.match(updates.at(-1), /EL-24/);
});

test('starts a fresh session after each completed booking', async () => {
  const savedBookings = [];
  const messages = [];
  const dependencies = {
    saveMessage: async (message) => messages.push(message),
    saveBooking: async (booking) => savedBookings.push(booking),
    understandMessage: async (text) => ({ intent: 'booking', updates: {
      name: text,
      date: '1 August 2027',
      time: '10 AM',
      adults: 1,
      children: 0,
    } }),
    createCalendarEvent: async () => { throw new Error('calendar unavailable'); },
    sendWhatsAppText: async () => ({ id: 'outbound-message' }),
  };

  await handleIncomingMessage({ from: '27111', text: 'first booking', messageId: 'first-message' }, dependencies);
  assert.equal(hasBookingSession('27111'), false);
  await handleIncomingMessage({ from: '27222', text: 'second booking', messageId: 'second-message' }, dependencies);
  assert.equal(hasBookingSession('27222'), false);
  assert.equal(savedBookings.length, 2);
  assert.equal(savedBookings[0].date, '2027-08-01');
  assert.equal(messages.filter((message) => message.direction === 'outbound').length, 2);
});

test('ignores duplicate WhatsApp message IDs', () => {
  assert.equal(shouldProcessMessage('duplicate-message'), true);
  assert.equal(shouldProcessMessage('duplicate-message'), false);
});

test('finds the next missing field', () => {
  let booking = emptyBooking();
  booking = mergeBooking(booking, { name: 'Sam', date: '2026-10-12' });
  assert.equal(firstMissingField(booking), 'time');
});

test('parses a direct answer to the name prompt', () => {
  assert.deepEqual(parseFieldAnswer('name', 'Sam'), { name: 'Sam' });
  assert.deepEqual(parseFieldAnswer('children', '0'), { children: 0 });
});