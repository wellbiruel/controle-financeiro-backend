const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://controle-financeiro-frontend.vercel.app';

// ── Google ──────────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: FRONTEND_URL + '/login?erro=google' }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, nome: req.user.nome },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const user = encodeURIComponent(JSON.stringify({ id: req.user.id, email: req.user.email, nome: req.user.nome }));
    res.redirect(`${FRONTEND_URL}/login?token=${token}&user=${user}`);
  }
);

// ── Microsoft ────────────────────────────────────────────────────────
router.get('/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read'] })
);

router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failureRedirect: FRONTEND_URL + '/login?erro=microsoft' }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, nome: req.user.nome },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const user = encodeURIComponent(JSON.stringify({ id: req.user.id, email: req.user.email, nome: req.user.nome }));
    res.redirect(`${FRONTEND_URL}/login?token=${token}&user=${user}`);
  }
);

module.exports = router;
