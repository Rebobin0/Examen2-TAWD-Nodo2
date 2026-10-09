const express = require('express');
const banco = require('./banco');
const config = require('./config');
const reportes = require('./reportes');
const auth = require('./auth');

const router = express.Router();

// El historial del Banco Central entrega como máximo 1000 movimientos por consulta
const LIMITE = 1000;

// ---------- Sesión ----------

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};

  if (!process.env.SUCURSAL_PASSWORD) {
    return res.status(500).json({ error: 'Falta SUCURSAL_PASSWORD en el archivo .env.' });
  }
  if (!auth.credencialesValidas(usuario, password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  auth.crearCookie(res, req, usuario);
  res.json({ usuario });
});

router.post('/logout', (req, res) => {
  auth.borrarCookie(res);
  res.json({ ok: true });
});

router.use(auth.requiereSesion);

// ---------- Sucursal y API Key ----------

// Estado de la conexión con el Banco Central
router.get('/sucursal', async (req, res) => {
  const apiKey = config.obtenerApiKey();
  if (!apiKey) return res.json({ usuario: req.usuario, configurada: false });

  try {
    const nodo = await banco.rpc('nodo_info');
    res.json({ usuario: req.usuario, configurada: true, api_key: config.prefijo(apiKey), nodo });
  } catch (e) {
    if (!(e instanceof banco.ErrorBanco)) throw e;
    res.json({ usuario: req.usuario, configurada: true, api_key: config.prefijo(apiKey), error: e.message });
  }
});

// Guarda el API Key solo si el Banco Central lo reconoce como una sucursal activa
router.put('/config/api-key', async (req, res) => {
  const apiKey = String(req.body?.api_key || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Escribe el API Key.' });

  const nodo = await banco.rpc('nodo_info', {}, apiKey);
  if (nodo.tipo !== 'sucursal') {
    return res.status(400).json({ error: 'Ese API Key pertenece a un cajero, no a una sucursal.' });
  }

  config.guardarApiKey(apiKey);
  res.json({ api_key: config.prefijo(apiKey), nodo });
});

// ---------- Cuentas ----------

router.get('/cuentas', async (req, res) => {
  res.json(await banco.rpc('cuentas_de_sucursal'));
});

router.post('/cuentas', async (req, res) => {
  const nombre = String(req.body?.nombre_titular || '').trim();
  const saldo = Number(req.body?.saldo_inicial ?? 0);

  if (!nombre) return res.status(400).json({ error: 'El nombre del titular es obligatorio.' });
  if (nombre.length > 80) return res.status(400).json({ error: 'El nombre no puede tener más de 80 caracteres.' });
  if (!Number.isFinite(saldo) || saldo < 0) return res.status(400).json({ error: 'El saldo inicial no es válido.' });

  const cuenta = await banco.rpc('crear_cuenta', { p_nombre_titular: nombre, p_saldo_inicial: saldo });
  res.status(201).json(cuenta);
});

router.get('/cuentas/:numero', async (req, res) => {
  res.json(await banco.rpc('consultar_saldo', { p_numero_cuenta: req.params.numero }));
});

// ---------- Historial ----------

// Sin ?cuenta: operaciones hechas en esta sucursal (historial local).
// Con ?cuenta=NUMERO: todos los movimientos de ese usuario, en cualquier nodo.
async function consultarHistorial(query) {
  const cuenta = String(query.cuenta || '').trim() || null;
  const filas = await banco.rpc('historial', { p_numero_cuenta: cuenta, p_limite: LIMITE });
  const hayFechas = query.desde || query.hasta;
  const rango = reportes.periodo(query.desde, query.hasta);

  return {
    cuenta,
    filas: hayFechas ? filas.filter((t) => reportes.enPeriodo(reportes.diaLocal(t.timestamp), rango)) : filas,
    limite_alcanzado: filas.length >= LIMITE,
  };
}

router.get('/historial', async (req, res) => {
  const resultado = await consultarHistorial(req.query);

  // Si se pide por usuario, se acompaña con los datos de la cuenta
  if (resultado.cuenta) {
    resultado.titular = await banco.rpc('consultar_saldo', { p_numero_cuenta: resultado.cuenta });
  }

  res.json(resultado);
});

router.get('/historial.csv', async (req, res) => {
  const { filas, cuenta } = await consultarHistorial(req.query);

  const contenido = reportes.csv([
    ['ID', 'Fecha', 'Tipo', 'Monto', 'Cuenta origen', 'Cuenta destino'],
    ...filas.map((t) => [t.id, t.timestamp, t.tipo, Number(t.monto).toFixed(2), t.cuenta_origen, t.cuenta_destino]),
  ]);

  res.attachment(cuenta ? `historial_${cuenta}.csv` : 'historial_sucursal.csv').type('text/csv; charset=utf-8').send(contenido);
});

// ---------- Reportes ----------

async function armarReporte(query) {
  const [nodo, transacciones, cuentas] = await Promise.all([
    banco.rpc('nodo_info'),
    banco.rpc('historial', { p_limite: LIMITE }),
    banco.rpc('cuentas_de_sucursal'),
  ]);

  return {
    ...reportes.generar({ nodo, transacciones, cuentas, desde: query.desde, hasta: query.hasta }),
    limite_alcanzado: transacciones.length >= LIMITE,
  };
}

router.get('/reportes', async (req, res) => {
  res.json(await armarReporte(req.query));
});

router.get('/reportes.csv', async (req, res) => {
  const r = await armarReporte(req.query);
  const dinero = (n) => Number(n).toFixed(2);

  const contenido = reportes.csv([
    ['Reporte de operaciones', r.sucursal.nombre, `Del ${r.desde} al ${r.hasta}`],
    [],
    ['Día', 'Operaciones', 'Depósitos', 'Monto depósitos', 'Retiros', 'Monto retiros', 'Transferencias', 'Monto transferencias'],
    ...r.por_dia.map((d) => [d.dia, d.operaciones, d.depositos, dinero(d.monto_depositos), d.retiros, dinero(d.monto_retiros), d.transferencias, dinero(d.monto_transferencias)]),
    ['TOTAL', r.resumen.operaciones, r.resumen.depositos, dinero(r.resumen.monto_depositos), r.resumen.retiros, dinero(r.resumen.monto_retiros), r.resumen.transferencias, dinero(r.resumen.monto_transferencias)],
    [],
    ['Cuentas abiertas en el periodo', r.cuentas_abiertas],
    ['Cuentas totales de la sucursal', r.cuentas_totales],
    ['Saldo en cuentas de la sucursal', dinero(r.saldo_en_cuentas)],
    ['Efectivo disponible en la sucursal', dinero(r.sucursal.efectivo_disponible)],
  ]);

  res.attachment(`reporte_sucursal_${r.desde}_${r.hasta}.csv`).type('text/csv; charset=utf-8').send(contenido);
});

module.exports = router;
