const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const transacaoRoutes = require('./routes/transacaoRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const entradasRoutes  = require('./routes/entradas');
const categoriasRoutes = require('./routes/categorias');
const reservaRoutes    = require('./routes/reserva');
const fluxoRoutes = require('./routes/fluxo');
const importacaoRoutes = require('./routes/importacao');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/transacoes', transacaoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/entradas',   entradasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/reserva',   reservaRoutes);
app.use('/api/fluxo', fluxoRoutes);
app.use('/api/importacao', importacaoRoutes);

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API funcionando!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

module.exports = app;