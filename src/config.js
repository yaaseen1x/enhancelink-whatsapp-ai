import 'dotenv/config';

const required = (name) => process.env[name]?.trim() || null;

export const config = {
  port: Number(process.env.PORT || 3000),
  whatsapp: { verifyToken: required('WHATSAPP_VERIFY_TOKEN'), accessToken: required('WHATSAPP_ACCESS_TOKEN'), phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'), apiVersion: process.env.WHATSAPP_API_VERSION || 'v22.0' },
  supabase: { url: required('SUPABASE_URL'), serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY') },
  gemini: { apiKey: required('GEMINI_API_KEY'), model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' },
  calendar: { id: required('GOOGLE_CALENDAR_ID'), email: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'), privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || null, timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Africa/Johannesburg' }
};