import express from 'express';
import { getUpcomingEvents } from '../services/calendarService.js';

const router = express.Router();

// GET /api/calendar/events — upcoming events from the configured calendar
router.get('/events', async (req, res, next) => {
  try {
    const events = await getUpcomingEvents(req.user.id);
    res.json(events);
  } catch (error) {
    next(error);
  }
});

export default router;
