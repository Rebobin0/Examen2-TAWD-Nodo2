// Interfaz de la sucursal. Todo el contenido que viene del servidor se inserta
// con textContent (nunca innerHTML) para que un nombre no pueda inyectar HTML.

const $ = (id) => document.getElementById(id);
const dinero = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fechaHora = (t) => new Date(t).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const fechaDia = (d) => d.split('-').reverse().join('/');
const TIPOS = { deposito: 'Depósito', retiro: 'Retiro', transferencia: 'Transferencia' };

/** Crea un elemento: el('td', { class: 'num' }, 'texto' | nodo | [nodos]) */
function el(etiqueta, atributos = {}, contenido = []) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) nodo.setAttribute(clave, valor);
  for (const hijo of [].concat(contenido)) nodo.append(hijo);
  return nodo;
}

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: opciones.method || 'GET',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });

  if (respuesta.status === 401 && (await respuesta.clone().json()).codigo === 'SIN_SESION') {
    location.href = '/';
    return new Promise(() => {});
  }

  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || 'Ocurrió un error.');
  return datos;
}

function avisar(texto, tipo = 'ok') {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.className = `aviso no-imprimir ${tipo}`;
  aviso.hidden = false;
  aviso.scrollIntoView({ block: 'nearest' });
}

const quitarAviso = () => { $('aviso').hidden = true; };

/** Ejecuta una acción mostrando su error en el aviso y bloqueando el botón del formulario. */
async function intentar(accion, formulario) {
  const boton = formulario?.querySelector('button[type=submit]');
  if (boton) boton.disabled = true;
  try {
    await accion();
  } catch (e) {
    avisar(e.message, 'error');
  } finally {
    if (boton) boton.disabled = false;
  }
}

function tarjeta(etiqueta, valor, nota) {
  return el('div', { class: 'tarjeta' }, [
    el('div', { class: 'etiqueta' }, etiqueta),
    el('div', { class: 'valor' }, valor),
    ...(nota ? [el('div', { class: 'nota' }, nota)] : []),
  ]);
}

/** columnas: [{ titulo, num?, celda: (fila) => texto | nodo }] */
function tabla(columnas, filas, textoVacio, pie) {
  if (filas.length === 0) return el('div', { class: 'vacio' }, textoVacio);

  const fila = (valores, etiqueta) => el('tr', {}, valores.map((v, i) =>
    el(etiqueta, columnas[i].num ? { class: 'num' } : {}, v)));

  const partes = [
    el('thead', {}, fila(columnas.map((c) => c.titulo), 'th')),
    el('tbody', {}, filas.map((f) => fila(columnas.map((c) => c.celda(f)), 'td'))),
  ];
  if (pie) partes.push(el('tfoot', {}, fila(pie, 'td')));

  return el('div', { class: 'tabla-scroll' }, el('table', {}, partes));
}

const etiqueta = (texto, clase) => el('span', { class: `etq ${clase}` }, texto);
const mono = (texto) => el('span', { class: 'mono' }, texto ?? '—');

// ---------- Sucursal ----------

let cuentas = [];

async function cargarSucursal() {
  const s = await api('/sucursal');
  $('usuario').textContent = s.usuario;

  const estado = $('estado-conexion');
  estado.replaceChildren();
  $('tarjetas-sucursal').replaceChildren();

  if (!s.configurada) {
    estado.append(el('div', { class: 'aviso alerta' }, 'Aún no hay API Key. Pídelo al administrador del Banco Central y captúralo abajo.'));
    return false;
  }
  if (s.error) {
    estado.append(el('div', { class: 'aviso error' }, `API Key ${s.api_key}: ${s.error}`));
    return false;
  }

  $('nombre-sucursal').textContent = s.nodo.nombre;
  document.title = `${s.nodo.nombre} · Sistema bancario`;
  estado.append(el('div', { class: 'aviso ok' },
    `Conectada como «${s.nodo.nombre}» (responsable: ${s.nodo.responsable || 'sin asignar'}). API Key ${s.api_key}`));

  $('tarjetas-sucursal').append(
    tarjeta('Efectivo en sucursal', dinero(s.nodo.efectivo_disponible)),
    tarjeta('Responsable', s.nodo.responsable || 'Sin asignar'),
    tarjeta('Estado', s.nodo.estado === 'activo' ? 'Activa' : 'Inactiva'),
  );
  return true;
}

// ---------- Cuentas ----------

async function cargarCuentas() {
  cuentas = await api('/cuentas');
  $('titulo-cuentas').textContent = `Cuentas abiertas en esta sucursal (${cuentas.length})`;

  $('tabla-cuentas').replaceChildren(tabla([
    { titulo: 'Número de cuenta', celda: (c) => mono(c.numero_cuenta) },
    { titulo: 'Titular', celda: (c) => c.nombre_titular },
    { titulo: 'Saldo', num: true, celda: (c) => dinero(c.saldo) },
    { titulo: 'Estado', celda: (c) => etiqueta(c.estado === 'activa' ? 'Activa' : 'Bloqueada', c.estado) },
    { titulo: 'Apertura', celda: (c) => fechaHora(c.created_at) },
    { titulo: '', celda: (c) => {
      const boton = el('button', { class: 'btn sec chico', type: 'button' }, 'Ver movimientos');
      boton.addEventListener('click', () => verHistorialDe(c.numero_cuenta));
      return boton;
    } },
  ], cuentas, 'Aún no hay cuentas abiertas en esta sucursal.'));

  // Selector de usuario del historial
  const selector = $('h-cuenta');
  const actual = selector.value;
  selector.replaceChildren(el('option', { value: '' }, 'Historial local de la sucursal'));
  for (const c of cuentas) {
    selector.append(el('option', { value: c.numero_cuenta }, `${c.nombre_titular} · ${c.numero_cuenta}`));
  }
  selector.value = actual;
}

$('form-cuenta').addEventListener('submit', (evento) => {
  evento.preventDefault();
  quitarAviso();

  intentar(async () => {
    const cuenta = await api('/cuentas', {
      method: 'POST',
      body: { nombre_titular: $('nombre_titular').value, saldo_inicial: Number($('saldo_inicial').value) },
    });

    avisar(`Cuenta ${cuenta.numero_cuenta} creada para ${cuenta.nombre_titular} con saldo de ${dinero(cuenta.saldo)}.`);
    evento.target.reset();
    await Promise.all([cargarSucursal(), cargarCuentas()]);
  }, evento.target);
});

// ---------- Historial ----------

function filtrosHistorial() {
  const parametros = new URLSearchParams();
  const cuenta = $('h-otra').value.trim() || $('h-cuenta').value;
  if (cuenta) parametros.set('cuenta', cuenta);
  if ($('h-desde').value) parametros.set('desde', $('h-desde').value);
  if ($('h-hasta').value) parametros.set('hasta', $('h-hasta').value);
  return parametros;
}

async function cargarHistorial() {
  const parametros = filtrosHistorial();
  $('csv-historial').href = `/api/historial.csv?${parametros}`;

  const h = await api(`/historial?${parametros}`);
  const total = h.filas.reduce((s, t) => s + Number(t.monto), 0);
  const cuantas = `${h.filas.length} ${h.filas.length === 1 ? 'transacción' : 'transacciones'} · ${dinero(total)}`;

  $('titulo-historial').textContent = h.titular
    ? `${h.titular.nombre_titular} · cuenta ${h.titular.numero_cuenta} · saldo ${dinero(h.titular.saldo)} — ${cuantas}`
    : `Historial local — ${cuantas}`;

  $('tabla-historial').replaceChildren(tabla([
    { titulo: 'ID', celda: (t) => mono(t.id) },
    { titulo: 'Fecha', celda: (t) => fechaHora(t.timestamp) },
    { titulo: 'Tipo', celda: (t) => etiqueta(TIPOS[t.tipo] || t.tipo, t.tipo) },
    { titulo: 'Monto', num: true, celda: (t) => dinero(t.monto) },
    { titulo: 'Cuenta origen', celda: (t) => mono(t.cuenta_origen) },
    { titulo: 'Cuenta destino', celda: (t) => mono(t.cuenta_destino) },
  ], h.filas, 'No hay transacciones que mostrar.'));

  if (h.limite_alcanzado) avisar('Se muestran los 1000 movimientos más recientes.', 'alerta');
}

function verHistorialDe(numero) {
  $('form-historial').reset();
  $('h-cuenta').value = numero;
  mostrar('historial');
}

$('form-historial').addEventListener('submit', (evento) => {
  evento.preventDefault();
  quitarAviso();
  intentar(cargarHistorial, evento.target);
});

$('form-historial').addEventListener('reset', () => {
  quitarAviso();
  setTimeout(() => intentar(cargarHistorial));
});

// ---------- Reportes ----------

async function cargarReporte() {
  const parametros = new URLSearchParams();
  if ($('r-desde').value) parametros.set('desde', $('r-desde').value);
  if ($('r-hasta').value) parametros.set('hasta', $('r-hasta').value);
  $('csv-reporte').href = `/api/reportes.csv?${parametros}`;

  const r = await api(`/reportes?${parametros}`);
  const s = r.resumen;
  $('r-desde').value = r.desde;
  $('r-hasta').value = r.hasta;
  $('periodo-reporte').textContent = `${r.sucursal.nombre} · del ${fechaDia(r.desde)} al ${fechaDia(r.hasta)}`;
  $('pie-reporte').textContent = `Generado el ${fechaHora(r.generado)} por ${$('usuario').textContent}`;

  const ops = (n) => `${n} ${n === 1 ? 'operación' : 'operaciones'}`;
  $('tarjetas-reporte').replaceChildren(
    tarjeta('Operaciones', String(s.operaciones), `${dinero(s.monto_total)} movidos`),
    tarjeta('Depósitos', dinero(s.monto_depositos), ops(s.depositos)),
    tarjeta('Retiros', dinero(s.monto_retiros), ops(s.retiros)),
    tarjeta('Transferencias', dinero(s.monto_transferencias), ops(s.transferencias)),
    tarjeta('Cuentas abiertas', String(r.cuentas_abiertas), `${r.cuentas_totales} en total · ${dinero(r.saldo_en_cuentas)}`),
    tarjeta('Efectivo en sucursal', dinero(r.sucursal.efectivo_disponible), 'Al momento del reporte'),
  );

  const conteo = (monto, n) => `${dinero(monto)} (${n})`;
  $('tabla-reporte').replaceChildren(tabla([
    { titulo: 'Día', celda: (d) => fechaDia(d.dia) },
    { titulo: 'Operaciones', num: true, celda: (d) => String(d.operaciones) },
    { titulo: 'Depósitos', num: true, celda: (d) => conteo(d.monto_depositos, d.depositos) },
    { titulo: 'Retiros', num: true, celda: (d) => conteo(d.monto_retiros, d.retiros) },
    { titulo: 'Transferencias', num: true, celda: (d) => conteo(d.monto_transferencias, d.transferencias) },
  ], r.por_dia, 'No hubo operaciones en el periodo.', [
    'Total del periodo', String(s.operaciones), conteo(s.monto_depositos, s.depositos),
    conteo(s.monto_retiros, s.retiros), conteo(s.monto_transferencias, s.transferencias),
  ]));

  if (r.limite_alcanzado) avisar('El reporte considera los 1000 movimientos más recientes.', 'alerta');
}

$('form-reporte').addEventListener('submit', (evento) => {
  evento.preventDefault();
  quitarAviso();
  intentar(cargarReporte, evento.target);
});

// ---------- Configuración ----------

$('form-api-key').addEventListener('submit', (evento) => {
  evento.preventDefault();
  quitarAviso();

  intentar(async () => {
    const r = await api('/config/api-key', { method: 'PUT', body: { api_key: $('api_key').value } });
    evento.target.reset();
    avisar(`API Key guardado. Sucursal conectada: ${r.nodo.nombre}.`);
    conectada = await cargarSucursal();
    if (conectada) await cargarCuentas();
  }, evento.target);
});

// ---------- Navegación ----------

let conectada = false;

function mostrar(vista) {
  // Sin conexión con el banco solo tiene sentido la pantalla de configuración
  if (!conectada) vista = 'configuracion';

  for (const boton of document.querySelectorAll('#nav button')) {
    boton.classList.toggle('activo', boton.dataset.vista === vista);
  }
  for (const seccion of document.querySelectorAll('main > section')) {
    seccion.hidden = seccion.id !== `vista-${vista}`;
  }

  if (vista === 'historial') intentar(cargarHistorial);
  if (vista === 'reportes') intentar(cargarReporte);
}

$('nav').addEventListener('click', (evento) => {
  if (!evento.target.dataset.vista) return;
  quitarAviso();
  mostrar(evento.target.dataset.vista);
});

$('salir').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
});

intentar(async () => {
  conectada = await cargarSucursal();
  if (conectada) await cargarCuentas();
  mostrar('cuentas');
});
