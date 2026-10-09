const path = require('path');
const express = require('express');
const cors = require('cors');
const api = require('./api');
const auth = require('./auth');
const { ErrorBanco } = require('./banco');

const app = express();
const PUBLICO = path.join(__dirname, '..', 'public');

// Coolify y otros hostings sirven la app detrás de un proxy HTTPS
app.set('trust proxy', 1);

// CORS apagado por defecto (la interfaz se sirve desde este mismo servidor).
// Para permitir otro origen: CORS_ORIGIN=https://otro-dominio.com
app.use(cors({ origin: process.env.CORS_ORIGIN || false, credentials: true }));
app.use(express.json({ limit: '10kb' }));

app.get('/salud', (req, res) => res.json({ ok: true }));

app.use('/api', api);

// La interfaz exige sesión; sin ella se muestra el login
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLICO, auth.leerSesion(req) ? 'panel.html' : 'login.html'));
});
app.use(express.static(PUBLICO, { index: false }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Errores: los del Banco Central conservan su estado HTTP y un mensaje claro
app.use((err, req, res, next) => {
  if (err instanceof ErrorBanco) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno de la sucursal.' });
});

module.exports = app;
