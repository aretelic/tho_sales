import { google } from 'googleapis';
import { db } from './db.js';

export function getOAuth2Client(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user?.refresh_token) {
    const err = new Error('No Google refresh token stored. Please sign out and sign back in to reconnect Google access.');
    err.status = 401;
    throw err;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL,
  );

  oauth2Client.setCredentials({ refresh_token: user.refresh_token });
  return oauth2Client;
}
