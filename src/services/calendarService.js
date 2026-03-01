import { google } from 'googleapis';
import { getOAuth2Client } from './googleClient.js';
import { db } from './db.js';

export async function getUpcomingEvents(userId, days = 14) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_ID is not configured in .env');
  }

  const auth = getOAuth2Client(userId);
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults: 20,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (response.data.items || []).filter(event =>
    Array.isArray(event.attendees) && event.attendees.some(a => !a.self)
  );

  return events.map(event => {
    const summary = event.summary || '';
    const match = summary
      ? db.prepare(
          "SELECT id, client_name FROM consultations WHERE LOWER(client_name) LIKE LOWER(?) LIMIT 1"
        ).get(`%${summary}%`)
      : null;

    return {
      id: event.id,
      summary: event.summary || '(No title)',
      description: event.description || null,
      start: event.start,
      end: event.end,
      linkedConsultationId: match?.id || null,
      linkedClientName: match?.client_name || null,
    };
  });
}
