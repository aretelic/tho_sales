export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}
