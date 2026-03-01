import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db } from './db.js';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('\n⚠  Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env\n');
} else {
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email returned from Google'));

    const allowlist = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowlist.length > 0 && !allowlist.includes(email.toLowerCase())) {
      return done(null, false, { message: 'Email not authorised' });
    }

    const now = new Date().toISOString();
    const avatarUrl = profile.photos?.[0]?.value || null;

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(profile.id);

    if (existing) {
      db.prepare(`
        UPDATE users
        SET display_name = ?, avatar_url = ?, refresh_token = COALESCE(?, refresh_token), last_login_at = ?
        WHERE id = ?
      `).run(profile.displayName, avatarUrl, refreshToken || null, now, profile.id);
    } else {
      db.prepare(`
        INSERT INTO users (id, email, display_name, avatar_url, refresh_token, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(profile.id, email, profile.displayName, avatarUrl, refreshToken || null, now, now);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(profile.id);
    done(null, user);
  }
));
} // end else

export default passport;
