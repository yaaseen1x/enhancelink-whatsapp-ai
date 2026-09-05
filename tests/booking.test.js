import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBooking, firstMissingField, mergeBooking, parseFieldAnswer, parseSimpleBookingText } from '../src/utils/booking.js';

test('parses booking details from one message', () => {
  const details = parseSimpleBookingText("My name is Sam. 2026-10-12 at 10 am, 2 adults and 1 child");
  assert.equal(details.name, 'Sam');
  assert.equal(details.date, '2026-10-12');
  assert.equal(details.time, '10 AM');
  assert.equal(details.adults, 2);
  assert.equal(details.children, 1);
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