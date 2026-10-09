# Sucursal · Servidor administrativo (Nodo 2)

Sistema en Express para los ejecutivos de una sucursal. No tiene base de datos:
todas las operaciones se piden al Banco Central (Supabase) mediante funciones RPC,
identificándose con el API Key de la sucursal.

## Funcionalidades

| Requisito del examen | Dónde está |
|---|---|
| Crear cuentas en la base central | Cuentas > Nueva cuenta (`crear_cuenta`) |
| Historial local | Historial, sin elegir usuario (`historial`) |
| Historial por usuario | Historial eligiendo una cuenta, o "Ver movimientos" en la lista |
| Reportes administrativos | Reportes: totales del periodo y por día; CSV e impresión/PDF |
| Conexión por API Key | Configuración: se verifica contra el banco antes de guardarse |

## Instalación

Requiere Node 20 o superior.

```bash
npm install
cp .env.example .env
```

Editar `.env`:

- `SUPABASE_URL` y `SUPABASE_ANON_KEY`: las mismas del Banco Central (clave anon, nunca service_role).
- `SUCURSAL_USUARIO` y `SUCURSAL_PASSWORD`: acceso de los ejecutivos.
- `SESSION_SECRET`: texto largo aleatorio.
- `BANCO_API_KEY`: opcional; también se captura en la pantalla Configuración.

```bash
npm start        # o: npm run dev  (reinicia al guardar cambios)
```

Abrir http://localhost:3000, iniciar sesión y pegar en Configuración el API Key
que muestra el panel del Banco Central al crear la sucursal.

## API

Todas las rutas (menos login) requieren la cookie de sesión.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/login` | `{ usuario, password }` |
| POST | `/api/logout` | Cierra la sesión |
| GET | `/api/sucursal` | Datos de la sucursal y estado de la conexión |
| PUT | `/api/config/api-key` | `{ api_key }` verifica y guarda el API Key |
| GET | `/api/cuentas` | Cuentas abiertas en la sucursal |
| POST | `/api/cuentas` | `{ nombre_titular, saldo_inicial }` crea una cuenta |
| GET | `/api/cuentas/:numero` | Titular, saldo y estado de una cuenta |
| GET | `/api/historial` | Local; con `?cuenta=` por usuario; `?desde=&hasta=` opcionales |
| GET | `/api/historial.csv` | Lo mismo en CSV |
| GET | `/api/reportes` | `?desde=&hasta=` (por defecto, el mes actual) |
| GET | `/api/reportes.csv` | Lo mismo en CSV |
| GET | `/salud` | Comprobación de vida, sin sesión |

## Estructura

| Archivo | Qué hace |
|---|---|
| `server.js` | Arranque |
| `src/app.js` | Express: middlewares, archivos estáticos y manejo de errores |
| `src/api.js` | Rutas de la API |
| `src/banco.js` | Cliente de Supabase: llamadas RPC con el API Key y traducción de errores |
| `src/config.js` | Lectura y guardado del API Key (`data/config.json` o `BANCO_API_KEY`) |
| `src/auth.js` | Login de ejecutivos con cookie firmada |
| `src/reportes.js` | Cálculo del reporte y generación de CSV |
| `public/` | Interfaz (HTML, CSS y JavaScript sin frameworks) |

## Despliegue en Coolify

1. New Resource > repositorio de GitHub > Build Pack **Nixpacks**.
2. Puerto expuesto: `3000`. Comando de inicio: `npm start` (lo detecta solo).
3. Variables de entorno: las de `.env.example`, incluida `BANCO_API_KEY`.
4. Con Auto Deploy activo, cada `git push` vuelve a desplegar.

En Coolify conviene usar `BANCO_API_KEY` como variable de entorno: el archivo
`data/config.json` se pierde en cada despliegue, salvo que se monte un volumen
persistente en `/app/data`.

## Límites conocidos

- El historial y los reportes consideran los 1000 movimientos más recientes de la sucursal.
- Hay un solo usuario de ejecutivo, definido en `.env`.
