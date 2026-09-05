# Enhance Link: SUP Cape Town WhatsApp Assistant

This is a complete Node.js booking assistant for the WhatsApp Cloud API. It answers FAQs, collects booking details, stores messages and bookings in Supabase, creates a Google Calendar event, and sends a confirmation.

## 1. Install and run

```bash
npm install
cp .env.example .env
npm test
npm start
```

The health check is available at `http://localhost:3000/health`.

## 2. Configure Supabase

1. Create a project at Supabase.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy the project URL and service role key into `.env`.

The service role key must stay on the server and must never be exposed in browser code.

## 3. Configure Gemini

Create a Gemini API key in Google AI Studio and set `GEMINI_API_KEY` in `.env`. Gemini classifies booking messages and answers FAQs using [`knowledge/business.json`](knowledge/business.json). If the key is missing, the local FAQ and parser keep the app usable for testing.

## 4. Configure Google Calendar

1. Create a Google Cloud project and enable the Google Calendar API.
2. Create a service account and download its credentials.
3. Put its email and private key in `.env`.
4. Share the target Google Calendar with the service-account email with permission to make changes.
5. Set `GOOGLE_CALENDAR_ID`.

The event duration is two hours and uses `Africa/Johannesburg` by default. Change this in `.env` if SUP Cape Town uses another timezone.

## 5. Connect WhatsApp Cloud API

1. Create or open a Meta developer app and add WhatsApp.
2. Copy the phone number ID and access token into `.env`.
3. Deploy this Node.js app to a public HTTPS URL.
4. In the Meta webhook settings, use `https://your-domain.example/webhook`.
5. Set the verify token to the exact value in `WHATSAPP_VERIFY_TOKEN`.
6. Subscribe the webhook to the `messages` field.

Meta sends a verification GET request first. The app answers it in `src/routes/webhook.js`. Incoming text messages are then passed to `src/services/assistant.js`.

## Where each file belongs

- `src/server.js`: starts the HTTP server.
- `src/app.js`: creates the Express app and health endpoint.
- `src/config.js`: reads environment variables.
- `src/routes/webhook.js`: WhatsApp verification and incoming webhook.
- `src/services/assistant.js`: booking conversation workflow.
- `src/services/gemini.js`: FAQ answers and intent/detail extraction.
- `src/services/whatsapp.js`: sends WhatsApp text messages.
- `src/services/supabase.js`: saves messages and bookings.
- `src/services/calendar.js`: creates Google Calendar events.
- `src/utils/booking.js`: booking fields and local fallback parser.
- `knowledge/business.json`: business facts used by the assistant.
- `supabase/schema.sql`: database tables and indexes.
- `tests/booking.test.js`: small automated parser tests.

## Important production notes

The conversation state is held in memory in `assistant.js`, so restarting the server loses an unfinished booking and multiple server instances will not share state. For production, move sessions to a Supabase `booking_sessions` table or Redis. Add webhook message-id deduplication before scaling horizontally. Also replace the placeholder business facts in the JSON knowledge base with SUP Cape Town's confirmed pricing, hours, launch locations, and parking instructions.