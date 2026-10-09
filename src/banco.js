// Cliente del Banco Central. La sucursal nunca toca tablas: solo llama a las
// funciones RPC, que validan el API Key del nodo en cada operación.
const { createClient } = require('@supabase/supabase-js');
const { obtenerApiKey } = require('./config');

const MENSAJES = {
  API_KEY_INVALIDA: 'El API Key no es válido. Revísalo en Configuración.',
  NODO_INACTIVO: 'El Banco Central desactivó esta sucursal.',
  OPERACION_NO_PERMITIDA_PARA_ESTE_NODO: 'El API Key pertenece a un cajero, no a una sucursal.',
  CUENTA_NO_ENCONTRADA: 'La cuenta no existe.',
  CUENTA_BLOQUEADA: 'La cuenta está bloqueada.',
  NOMBRE_REQUERIDO: 'El nombre del titular es obligatorio.',
  MONTO_INVALIDO: 'El monto no es válido.',
  FONDOS_INSUFICIENTES: 'La cuenta no tiene fondos suficientes.',
  EFECTIVO_INSUFICIENTE_EN_NODO: 'La sucursal no tiene efectivo suficiente.',
};

class ErrorBanco extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

let cliente;

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new ErrorBanco(500, 'SIN_CONFIGURAR', 'Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el archivo .env.');
  }

  cliente ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cliente;
}

/**
 * Llama a una función del Banco Central agregando el API Key de la sucursal.
 * Los parámetros undefined/null se omiten para que apliquen los valores por defecto.
 */
async function rpc(funcion, parametros = {}, apiKey = obtenerApiKey()) {
  if (!apiKey) {
    throw new ErrorBanco(409, 'SIN_API_KEY', 'La sucursal aún no tiene API Key. Captúralo en Configuración.');
  }

  const args = { p_api_key: apiKey };
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null) args[clave] = valor;
  }

  let respuesta;
  try {
    respuesta = await supabase().rpc(funcion, args);
  } catch (e) {
    if (e instanceof ErrorBanco) throw e;
    throw new ErrorBanco(503, 'SIN_CONEXION', 'No se pudo conectar con el Banco Central.');
  }

  const { data, error, status } = respuesta;

  if (error) {
    // Sin respuesta HTTP (red caída, DNS, URL mal escrita)
    if (!status) {
      throw new ErrorBanco(503, 'SIN_CONEXION', 'No se pudo conectar con el Banco Central.');
    }

    const codigo = error.message || 'ERROR_DESCONOCIDO';
    throw new ErrorBanco(status, codigo, MENSAJES[codigo] || `El Banco Central respondió con un error: ${codigo}`);
  }

  return data;
}

module.exports = { rpc, ErrorBanco };
