// Arma el reporte de la sucursal a partir de su historial local.
const ZONA = () => process.env.ZONA_HORARIA || 'America/Mexico_City';

/** Fecha local AAAA-MM-DD de un timestamp, en la zona de la sucursal. */
function diaLocal(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA(), year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(timestamp));
}

const esFecha = (texto) => typeof texto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(Date.parse(texto));

/** Periodo por defecto: del día 1 del mes actual a hoy. */
function periodo(desde, hasta) {
  const hoy = diaLocal(Date.now());
  return {
    desde: esFecha(desde) ? desde : `${hoy.slice(0, 8)}01`,
    hasta: esFecha(hasta) ? hasta : hoy,
  };
}

const enPeriodo = (dia, { desde, hasta }) => dia >= desde && dia <= hasta;

const TIPOS = ['deposito', 'retiro', 'transferencia'];

function vacio() {
  const base = { operaciones: 0, monto_total: 0 };
  for (const tipo of TIPOS) {
    base[`${tipo}s`] = 0;
    base[`monto_${tipo}s`] = 0;
  }
  return base;
}

function sumar(acumulado, transaccion) {
  const monto = Number(transaccion.monto);
  acumulado.operaciones += 1;
  acumulado.monto_total += monto;
  acumulado[`${transaccion.tipo}s`] += 1;
  acumulado[`monto_${transaccion.tipo}s`] += monto;
}

function redondear(objeto) {
  for (const clave of Object.keys(objeto)) {
    if (clave.startsWith('monto')) objeto[clave] = Math.round(objeto[clave] * 100) / 100;
  }
  return objeto;
}

function generar({ nodo, transacciones, cuentas, desde, hasta }) {
  const rango = periodo(desde, hasta);
  const resumen = vacio();
  const dias = new Map();

  for (const t of transacciones) {
    const dia = diaLocal(t.timestamp);
    if (!enPeriodo(dia, rango)) continue;

    sumar(resumen, t);
    if (!dias.has(dia)) dias.set(dia, { dia, ...vacio() });
    sumar(dias.get(dia), t);
  }

  const cuentasNuevas = cuentas.filter((c) => enPeriodo(diaLocal(c.created_at), rango));

  return {
    ...rango,
    generado: new Date().toISOString(),
    sucursal: nodo,
    resumen: redondear(resumen),
    por_dia: [...dias.values()].map(redondear).sort((a, b) => b.dia.localeCompare(a.dia)),
    cuentas_abiertas: cuentasNuevas.length,
    cuentas_totales: cuentas.length,
    saldo_en_cuentas: Math.round(cuentas.reduce((s, c) => s + Number(c.saldo), 0) * 100) / 100,
  };
}

/** Convierte filas a CSV (con BOM para que Excel respete los acentos). */
function csv(filas) {
  const celda = (valor) => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return '﻿' + filas.map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n';
}

module.exports = { generar, csv, diaLocal, periodo, enPeriodo };
