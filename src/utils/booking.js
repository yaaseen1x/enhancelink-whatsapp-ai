export const FIELDS = ['name', 'date', 'time', 'adults', 'children'];

export function emptyBooking() {
  return Object.fromEntries(FIELDS.map((field) => [field, null]));
}

export function firstMissingField(booking) {
  return FIELDS.find((field) => booking[field] === null || booking[field] === undefined || booking[field] === '') || null;
}

export function mergeBooking(current, updates = {}) {
  const merged = { ...current };
  for (const field of FIELDS) {
    if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') merged[field] = updates[field];
  }
  return merged;
}

export function parseSimpleBookingText(text) {
  const updates = {};
  const lower = text.toLowerCase();
  const name = text.match(/(?:my name is|name is|i am|i'm)\s+([a-z][a-z '-]{1,50})/i);
  const date = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  const time = text.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i);
  const adults = text.match(/(\d+)\s*adults?/i);
  const children = text.match(/(\d+)\s*(?:children|child)/i);
  if (name) updates.name = name[1].trim();
  if (date) updates.date = date[1];
  if (time) updates.time = time[1].replace(/\s+/g, ' ').toUpperCase();
  if (adults) updates.adults = Number(adults[1]);
  if (children) updates.children = Number(children[1]);
  if (!adults && /\b(adult|adults|people|persons)\b/.test(lower)) {
    const number = text.match(/\b(\d+)\b/);
    if (number) updates.adults = Number(number[1]);
  }
  return updates;
}

export function parseFieldAnswer(field, text) {
  if (field === 'name') return { name: text.trim() };
  if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return { date: text.trim() };
  if (field === 'time' && /\d/.test(text)) return { time: text.trim().toUpperCase() };
  if (field === 'adults' && /^\d+$/.test(text.trim())) return { adults: Number(text.trim()) };
  if (field === 'children' && /^\d+$/.test(text.trim())) return { children: Number(text.trim()) };
  return {};
}

export function formatBooking(booking) {
  return `Name: ${booking.name}\nDate: ${booking.date}\nTime: ${booking.time}\nAdults: ${booking.adults}\nChildren: ${booking.children}`;
}