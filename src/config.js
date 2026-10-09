// Guarda el API Key de la sucursal. Prioridad: data/config.json (capturado en
// la pantalla Configuración) y, si no existe, la variable BANCO_API_KEY.
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'data', 'config.json');

function leerArchivo() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  } catch {
    return {};
  }
}

function obtenerApiKey() {
  return leerArchivo().api_key || process.env.BANCO_API_KEY || '';
}

function guardarApiKey(apiKey) {
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify({ api_key: apiKey }, null, 2), { mode: 0o600 });
}

/** Para mostrar en pantalla sin revelar el secreto: bk_suc_1a2b… */
function prefijo(apiKey) {
  return apiKey ? `${apiKey.slice(0, 12)}…` : '';
}

module.exports = { obtenerApiKey, guardarApiKey, prefijo };
