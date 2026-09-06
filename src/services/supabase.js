import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { bookingPeople, calculateRemainingCapacity, canAcceptBooking, MAX_PEOPLE_PER_SLOT } from '../utils/booking.js';

const client = config.supabase.url && config.supabase.serviceRoleKey ? createClient(config.supabase.url, config.supabase.serviceRoleKey) : null;

export class BookingLimitError extends Error {
  constructor(booking, reason = 'slot', remainingCapacity = 0) {
    super(`The people limit of ${MAX_PEOPLE_PER_SLOT} has been reached for ${booking.date} at ${booking.time}.`);
    this.name = 'BookingLimitError';
    this.reason = reason;
    this.remainingCapacity = remainingCapacity;
  }
}

async function insert(table, row) {
  if (!client) {
    console.warn(`Supabase is not configured; skipped insert into ${table}.`);
    return null;
  }
  const { data, error } = await client.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function saveBooking(booking) {
  const requestedPeople = bookingPeople(booking);
  const { currentBooked, remainingCapacity } = await getSlotCapacity(booking.date, booking.time);
  console.log(`[Capacity] Current capacity: ${currentBooked}, Requested capacity: ${requestedPeople}, Remaining capacity: ${remainingCapacity}`);
  if (!canAcceptBooking(currentBooked, requestedPeople)) {
    throw new BookingLimitError(booking, requestedPeople > MAX_PEOPLE_PER_SLOT ? 'booking' : 'slot', remainingCapacity);
  }
  let saved;
  try {
    saved = await insert('bookings', { ...booking, total_people: requestedPeople });
  } catch (error) {
    if (/people limit for this time slot/i.test(error.message || '')) {
      const currentRemaining = await getRemainingCapacity(booking.date, booking.time);
      throw new BookingLimitError(booking, requestedPeople > MAX_PEOPLE_PER_SLOT ? 'booking' : 'slot', currentRemaining);
    }
    throw error;
  }
  if (!saved?.id) return saved;
  const bookingReference = `EL-${saved.id}`;
  return updateBooking(saved.id, { booking_reference: bookingReference });
}

async function getSlotCapacity(date, time) {
  if (!client) return { currentBooked: 0, remainingCapacity: MAX_PEOPLE_PER_SLOT };
  const { data, error } = await client.from('bookings').select('total_people, adults, children')
    .eq('date', date)
    .eq('time', time)
    .eq('status', 'confirmed');
  if (error) throw error;
  const currentBooked = data.reduce((total, booking) => total + Number(booking.total_people ?? booking.adults + booking.children), 0);
  return { currentBooked, remainingCapacity: calculateRemainingCapacity(currentBooked) };
}

async function getRemainingCapacity(date, time) {
  return (await getSlotCapacity(date, time)).remainingCapacity;
}

async function findBooking({ phoneNumber, reference }) {
  if (!client) return null;
  let query = client.from('bookings').select('*');
  if (reference) query = query.eq('booking_reference', reference);
  else query = query.eq('phone_number', phoneNumber).order('created_at', { ascending: false }).limit(1);
  if (reference) query = query.eq('phone_number', phoneNumber).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

async function updateBooking(id, updates) {
  if (!client) return null;
  if (updates.date || updates.time || updates.adults !== undefined || updates.children !== undefined) {
    const { data: current, error: currentError } = await client.from('bookings').select('date, time, adults, children, status').eq('id', id).single();
    if (currentError) throw currentError;
    const date = updates.date || current.date;
    const time = updates.time || current.time;
    const adults = updates.adults ?? current.adults;
    const children = updates.children ?? current.children;
    const { currentBooked, remainingCapacity } = await getSlotCapacity(date, time);
    const currentBookingPeople = current.adults + current.children;
    const availableAfterRemovingCurrent = remainingCapacity + currentBookingPeople;
    const requestedPeople = adults + children;
    console.log(`[Capacity] Current capacity: ${currentBooked}, Requested capacity: ${requestedPeople}, Remaining capacity: ${availableAfterRemovingCurrent}`);
    if (!canAcceptBooking(currentBooked - currentBookingPeople, requestedPeople)) throw new BookingLimitError({ date, time }, requestedPeople > MAX_PEOPLE_PER_SLOT ? 'booking' : 'slot', availableAfterRemovingCurrent);
    updates = { ...updates, total_people: requestedPeople };
  }
  const { data, error } = await client.from('bookings').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function saveBookingAudit(audit) {
  if (!client) return null;
  return insert('booking_audit', audit);
}

async function saveCalendarEventId(id, calendarEventId) {
  return updateBooking(id, { calendar_event_id: calendarEventId });
}

export const supabaseService = { isConfigured: Boolean(client), saveMessage: (message) => insert('messages', message), saveBooking, findBooking, updateBooking, saveBookingAudit, saveCalendarEventId, getRemainingCapacity };