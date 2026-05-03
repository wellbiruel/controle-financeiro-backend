const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const transacaoRoutes = require('./routes/transacaoRoutes');
const fluxoRoutes = require('./routes/fluxo');
const importacaoRoutes  = require('./routes/importacao');
const dashboardRoutes   = require('./routes/dashboardRoutes');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.JWT_SECRET || 'financeiro_amanda_well_2026_secreto',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/auth', oauthRoutes);
app.use('/api/transacoes', transacaoRoutes);
app.use('/api/fluxo', fluxoRoutes);
app.use('/api/importacao', importacaoRoutes);
app.use('/api/dashboard',  dashboardRoutes);

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API funcionando!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

module.exports = app;
