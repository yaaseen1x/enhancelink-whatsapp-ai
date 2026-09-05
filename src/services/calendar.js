import { google } from 'googleapis';
import { config } from '../config.js';

export async function createCalendarEvent(booking, phone) {
  if (!config.calendar.id || !config.calendar.email || !config.calendar.privateKey) {
    console.warn('Google Calendar is not configured; skipped event creation.');
    return null;
  }
  const auth = new google.auth.JWT({ email: config.calendar.email, key: config.calendar.privateKey, scopes: ['https://www.googleapis.com/auth/calendar'] });
  const calendar = google.calendar({ version: 'v3', auth });
  const startDate = new Date(`${booking.date}T${to24HourTime(booking.time)}:00+02:00`);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const { data } = await calendar.events.insert({ calendarId: config.calendar.id, requestBody: {
    summary: `SUP Cape Town booking - ${booking.name}`,
    description: `${booking.adults} adults, ${booking.children} children\nWhatsApp: ${phone}`,
    start: { dateTime: startDate.toISOString(), timeZone: config.calendar.timezone },
    end: { dateTime: endDate.toISOString(), timeZone: config.calendar.timezone }
  } });
  return data;
}

function to24HourTime(value) {
  const match = String(value).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return '09:00';
  let hour = Number(match[1]);
  const minute = match[2] || '00';
  if (match[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (match[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}