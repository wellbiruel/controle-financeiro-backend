const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const transacaoRoutes = require('./routes/transacaoRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/transacoes', transacaoRoutes);

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API funcionando!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

module.exports = app;