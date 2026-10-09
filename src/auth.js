// Sesión de los ejecutivos: cookie firmada con HMAC, sin dependencias extra.
const crypto = require('crypto');

const COOKIE = 'suc_sesion';
const DURACION_MS = 8 * 60 * 60 * 1000; // una jornada

// Si no hay SESSION_SECRET se genera uno al arrancar (las sesiones se pierden al reiniciar)
const secreto = () => (process.env.SESSION_SECRET ||= crypto.randomBytes(32).toString('hex'));

const firmar = (texto) => crypto.createHmac('sha256', secreto()).update(texto).digest('base64url');

function iguales(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function credencialesValidas(usuario, password) {
  const esperado = process.env.SUCURSAL_PASSWORD;
  if (!esperado) return false; // sin contraseña configurada nadie entra

  return iguales(usuario, process.env.SUCURSAL_USUARIO || 'ejecutivo') && iguales(password, esperado);
}

function crearCookie(res, req, usuario) {
  const datos = Buffer.from(JSON.stringify({ u: usuario, exp: Date.now() + DURACION_MS })).toString('base64url');

  res.cookie(COOKIE, `${datos}.${firmar(datos)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: DURACION_MS,
  });
}

function borrarCookie(res) {
  res.clearCookie(COOKIE);
}

function leerSesion(req) {
  const cabecera = req.headers.cookie || '';
  const par = cabecera.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!par) return null;

  const [datos, firma] = decodeURIComponent(par.slice(COOKIE.length + 1)).split('.');
  if (!datos || !firma || !iguales(firma, firmar(datos))) return null;

  try {
    const sesion = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return sesion.exp > Date.now() ? sesion : null;
  } catch {
    return null;
  }
}

/** Protege la API: responde 401 si no hay sesión. */
function requiereSesion(req, res, next) {
  const sesion = leerSesion(req);
  if (!sesion) return res.status(401).json({ error: 'Inicia sesión para continuar.', codigo: 'SIN_SESION' });

  req.usuario = sesion.u;
  next();
}

module.exports = { credencialesValidas, crearCookie, borrarCookie, leerSesion, requiereSesion };
