/**
 * Cache.gs
 * Capa de memoria para las lecturas de Google Sheets.
 *
 * Abrir un archivo de Sheets y leer un rango son las operaciones mas lentas de
 * Apps Script: cada una cuesta cientos de milisegundos. Una sola pantalla puede
 * necesitar la misma hoja varias veces (los catalogos, por ejemplo, se usan en
 * casi todas las consultas), y sin memoria cada una de esas veces vuelve a
 * pagar el costo completo.
 *
 * Hay dos niveles:
 *
 *   1. Memoria de la ejecucion: mientras se atiende una peticion, cada hoja se
 *      lee una sola vez, por mas que se pida diez veces.
 *
 *   2. Cache compartida (CacheService): el resultado queda disponible para las
 *      siguientes peticiones y para los demas usuarios, durante el tiempo que
 *      define CONFIG.CACHE_SEGUNDOS.
 *
 * Toda escritura invalida la tabla afectada, asi que nadie ve datos viejos
 * despues de un cambio: la cache solo acelera la lectura repetida de lo mismo.
 */

/** Libros ya abiertos en esta ejecucion. */
var MEMO_LIBROS = {};
/** Tablas ya leidas en esta ejecucion. */
var MEMO_TABLAS = {};

/** Tamano maximo por entrada de CacheService, con margen para acentos (UTF-8). */
var CACHE_TAMANO_BLOQUE = 45000;

/**
 * Abre un libro una sola vez por ejecucion.
 * @param {string} idLibro
 * @return {!Spreadsheet}
 * @private
 */
function getLibro_(idLibro) {
  if (!MEMO_LIBROS[idLibro]) MEMO_LIBROS[idLibro] = SpreadsheetApp.openById(idLibro);
  return MEMO_LIBROS[idLibro];
}

/** @private */
function claveCache_(tabla) {
  return 'tabla_v1_' + tabla;
}

/**
 * Lee una tabla de la cache compartida.
 * @param {string} tabla
 * @return {?Array<!Object>} null si no esta en cache.
 * @private
 */
function leerDeCache_(tabla) {
  if (!CONFIG.CACHE_SEGUNDOS) return null;
  try {
    var cache = CacheService.getScriptCache();
    var indice = cache.get(claveCache_(tabla));
    if (!indice) return null;

    var meta = JSON.parse(indice);
    var partes = [];
    for (var i = 0; i < meta.bloques; i++) {
      var parte = cache.get(claveCache_(tabla) + '_' + i);
      if (parte === null) return null;        // un bloque expiro: se descarta todo
      partes.push(parte);
    }
    return JSON.parse(partes.join(''));
  } catch (e) {
    return null;   // la cache nunca debe romper una lectura
  }
}

/**
 * Guarda una tabla en la cache compartida, partida en bloques si hace falta.
 * @param {string} tabla
 * @param {!Array<!Object>} filas
 * @private
 */
function guardarEnCache_(tabla, filas) {
  if (!CONFIG.CACHE_SEGUNDOS) return;
  try {
    var texto = JSON.stringify(filas);
    var bloques = Math.ceil(texto.length / CACHE_TAMANO_BLOQUE);
    // Una tabla enorme no vale la pena cachearla: ocuparia toda la cache.
    if (bloques > 20) return;

    var valores = {};
    for (var i = 0; i < bloques; i++) {
      valores[claveCache_(tabla) + '_' + i] =
          texto.substring(i * CACHE_TAMANO_BLOQUE, (i + 1) * CACHE_TAMANO_BLOQUE);
    }
    valores[claveCache_(tabla)] = JSON.stringify({ bloques: bloques });
    CacheService.getScriptCache().putAll(valores, CONFIG.CACHE_SEGUNDOS);
  } catch (e) {
    // Sin cache el sistema sigue funcionando, solo mas lento.
  }
}

/**
 * Descarta lo memorizado de una tabla. Se llama en cada escritura.
 * @param {string} tabla
 */
function invalidarTabla_(tabla) {
  delete MEMO_TABLAS[tabla];
  if (!CONFIG.CACHE_SEGUNDOS) return;
  try {
    var cache = CacheService.getScriptCache();
    var indice = cache.get(claveCache_(tabla));
    var claves = [claveCache_(tabla)];
    if (indice) {
      var meta = JSON.parse(indice);
      for (var i = 0; i < meta.bloques; i++) claves.push(claveCache_(tabla) + '_' + i);
    }
    cache.removeAll(claves);
  } catch (e) {
    // Si no se pudo limpiar, el dato viejo vive a lo sumo CACHE_SEGUNDOS.
  }
}

/**
 * Vacia toda la memoria. Util despues de editar las hojas a mano.
 * @return {!Object}
 */
function limpiarCache() {
  var tablas = Object.keys(ESQUEMA_PARAMETRIZACION).concat(Object.keys(ESQUEMA_TRANSACCIONAL));
  tablas.forEach(invalidarTabla_);
  MEMO_LIBROS = {};
  var resultado = { limpiadas: tablas.length,
                    mensaje: 'Memoria vaciada. La proxima consulta leera directo de las hojas.' };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Mide cuanto tarda cada consulta de la aplicacion. Sirve para comprobar el
 * efecto de la cache: la primera corrida lee de las hojas y la segunda deberia
 * ser varias veces mas rapida.
 * @return {!Object} Tiempos en milisegundos.
 */
function medirRendimiento() {
  function medir(nombre, fn) {
    var t = new Date().getTime();
    try { fn(); } catch (e) { return { consulta: nombre, error: e.message }; }
    return { consulta: nombre, ms: new Date().getTime() - t };
  }

  limpiarCache();
  var frio = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(12); })
  ];

  MEMO_TABLAS = {};   // se conserva la cache compartida, se borra la de ejecucion
  var caliente = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(12); })
  ];

  var resultado = {
    sinCache: frio,
    conCache: caliente,
    cacheSegundos: CONFIG.CACHE_SEGUNDOS
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
