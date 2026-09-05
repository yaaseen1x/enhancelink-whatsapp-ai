import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const client = config.supabase.url && config.supabase.serviceRoleKey ? createClient(config.supabase.url, config.supabase.serviceRoleKey) : null;

async function insert(table, row) {
  if (!client) {
    console.warn(`Supabase is not configured; skipped insert into ${table}.`);
    return null;
  }
  const { data, error } = await client.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export const supabaseService = { isConfigured: Boolean(client), saveMessage: (message) => insert('messages', message), saveBooking: (booking) => insert('bookings', booking) };