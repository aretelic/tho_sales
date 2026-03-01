import express from 'express';
import passport from 'passport';

const router = express.Router();

const GOOGLE_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

// GET /auth/google — kick off OAuth flow
router.get('/google', passport.authenticate('google', {
  scope: GOOGLE_SCOPES,
  accessType: 'offline',
}));

// GET /auth/google/callback — OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=unauthorised' }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// GET /auth/me — current user info for frontend
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    id: req.user.id,
    email: req.user.email,
    displayName: req.user.display_name,
    avatarUrl: req.user.avatar_url,
  });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  });
});

export default router;
