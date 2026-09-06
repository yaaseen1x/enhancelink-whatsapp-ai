export const FIELDS = ['name', 'date', 'time', 'adults', 'children'];
export const MAX_PEOPLE_PER_SLOT = 30;

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

export function bookingPeople(booking) {
  return Number(booking.adults || 0) + Number(booking.children || 0);
}

export function calculateRemainingCapacity(currentBooked) {
  return Math.max(0, MAX_PEOPLE_PER_SLOT - Number(currentBooked || 0));
}

export function canAcceptBooking(currentBooked, requestedPeople) {
  return Number(currentBooked || 0) + Number(requestedPeople || 0) <= MAX_PEOPLE_PER_SLOT;
}

export function extractBookingReference(text) {
  const match = String(text).match(/\bEL-(\d+)\b/i);
  return match ? `EL-${match[1]}` : null;
}

export function parseBookingModification(text) {
  const value = String(text);
  const reference = extractBookingReference(value);
  const isModification = Boolean(reference) || /\b(change|modify|update|add|remove|drop)\b/i.test(value);
  if (!isModification) return null;
  const parsed = parseSimpleBookingText(value);
  const updates = {};
  if (parsed.date) updates.date = parsed.date;
  if (parsed.time) updates.time = parsed.time.replace(/(\d)(AM|PM)$/i, '$1 $2');
  const adults = value.match(/(?:change|set|to)\s+(?:the\s+)?adults?\s+(?:to\s+)?(\d+)|add\s+(\d+)\s+adults?/i);
  const children = value.match(/(?:change|set|to)\s+(?:the\s+)?children?\s+(?:to\s+)?(\d+)|add\s+(\d+)\s+children?|add\s+another\s+child/i);
  if (adults) updates.adults = adults[1] ? Number(adults[1]) : { add: Number(adults[2]) };
  if (children) updates.children = children[1] ? Number(children[1]) : { add: children[2] ? Number(children[2]) : 1 };
  return { reference, updates };
}

const MONTHS = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function johannesburgDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function relativeBookingDate(value, now) {
  const lower = value.toLowerCase();
  const today = johannesburgDateParts(now);
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
  if (lower === 'today') return validIsoDate(today.year, today.month, today.day);
  if (lower === 'tomorrow') {
    base.setUTCDate(base.getUTCDate() + 1);
    return validIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  }
  const weekday = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (!weekday) return null;
  const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday[1]);
  const daysAhead = ((targetDay - base.getUTCDay() + 7) % 7) || 7;
  base.setUTCDate(base.getUTCDate() + daysAhead);
  return validIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

export function normalizeBookingDate(value, now = new Date()) {
  const date = String(value || '').trim();
  const relative = relativeBookingDate(date, now);
  if (relative) return relative;
  let match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  match = date.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i);
  if (match) return validIsoDate(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  match = date.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\s+(\d{4})$/i);
  if (match) return validIsoDate(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
  return null;
}

export function parseSimpleBookingText(text) {
  const updates = {};
  const lower = text.toLowerCase();
  const name = text.match(/(?:my name is|name is|i am|i'm)\s+([a-z][a-z '-]{1,50})/i);
  const date = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  const textDate = text.match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})|(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\s+(\d{4}))\b/i);
  const relativeDate = text.match(/\b(?:today|tomorrow|next\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b/i);
  const time = text.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i);
  const adults = text.match(/(\d+)\s*adults?/i);
  const children = text.match(/(\d+)\s*(?:children|child)/i);
  if (name) updates.name = name[1].trim();
  if (date) updates.date = normalizeBookingDate(date[1]);
  if (!date && textDate) {
    const day = textDate[1] || textDate[5];
    const month = textDate[2] || textDate[4];
    const year = textDate[3] || textDate[6];
    updates.date = normalizeBookingDate(`${day} ${month} ${year}`);
  }
  if (!date && !textDate && relativeDate) updates.date = normalizeBookingDate(relativeDate[0]);
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
  if (field === 'date') {
    const date = normalizeBookingDate(text);
    if (date) return { date };
  }
  if (field === 'time' && /\d/.test(text)) return { time: text.trim().toUpperCase() };
  if (field === 'adults' && /^\d+$/.test(text.trim())) return { adults: Number(text.trim()) };
  if (field === 'children' && /^\d+$/.test(text.trim())) return { children: Number(text.trim()) };
  return {};
}

export function formatBooking(booking) {
  return `Name: ${booking.name}\nDate: ${booking.date}\nTime: ${booking.time}\nAdults: ${booking.adults}\nChildren: ${booking.children}`;
}