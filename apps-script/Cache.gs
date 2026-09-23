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
/** Encabezados reales de cada hoja, ya verificados contra el esquema. */
var MEMO_ENCABEZADOS = {};

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
 * Cuanto vive en cache cada tabla.
 *
 * La parametrizacion (roles, fases, SLA, festivos, catalogos) cambia unas pocas
 * veces al ano; las hojas transaccionales cambian todo el dia. No tiene sentido
 * releerlas con la misma frecuencia. En los dos casos, cualquier escritura
 * desde la aplicacion invalida la tabla de inmediato: el plazo solo aplica a
 * ediciones hechas a mano en el Sheets, y para eso esta el boton Actualizar.
 *
 * @param {string} tabla
 * @return {number} Segundos.
 * @private
 */
function segundosDeCache_(tabla) {
  if (!CONFIG.CACHE_SEGUNDOS) return 0;
  return ESQUEMA_PARAMETRIZACION[tabla]
      ? CONFIG.CACHE_PARAMETRIZACION_SEGUNDOS
      : CONFIG.CACHE_SEGUNDOS;
}

/**
 * Lee de la cache un texto guardado por bloques.
 * @param {string} prefijo
 * @return {?string} null si no esta completo en cache.
 * @private
 */
function leerBloques_(prefijo) {
  try {
    var cache = CacheService.getScriptCache();
    var indice = cache.get(prefijo);
    if (!indice) return null;

    var meta = JSON.parse(indice);
    var partes = [];
    for (var i = 0; i < meta.bloques; i++) {
      var parte = cache.get(prefijo + '_' + i);
      if (parte === null) return null;        // un bloque expiro: se descarta todo
      partes.push(parte);
    }
    return partes.join('');
  } catch (e) {
    return null;   // la cache nunca debe romper una lectura
  }
}

/**
 * Guarda un texto en cache, partido en bloques si hace falta.
 * @param {string} prefijo
 * @param {string} texto
 * @param {number} segundos
 * @private
 */
function guardarBloques_(prefijo, texto, segundos) {
  if (!segundos) return;
  try {
    var bloques = Math.ceil(texto.length / CACHE_TAMANO_BLOQUE);
    // Algo enorme no vale la pena cachearlo: ocuparia toda la cache.
    if (bloques > 20) return;

    var valores = {};
    for (var i = 0; i < bloques; i++) {
      valores[prefijo + '_' + i] =
          texto.substring(i * CACHE_TAMANO_BLOQUE, (i + 1) * CACHE_TAMANO_BLOQUE);
    }
    valores[prefijo] = JSON.stringify({ bloques: bloques });
    CacheService.getScriptCache().putAll(valores, segundos);
  } catch (e) {
    // Sin cache el sistema sigue funcionando, solo mas lento.
  }
}

/** Borra un texto guardado por bloques. @private */
function borrarBloques_(prefijo) {
  try {
    var cache = CacheService.getScriptCache();
    var indice = cache.get(prefijo);
    var claves = [prefijo];
    if (indice) {
      var meta = JSON.parse(indice);
      for (var i = 0; i < meta.bloques; i++) claves.push(prefijo + '_' + i);
    }
    cache.removeAll(claves);
  } catch (e) {
    // Si no se pudo limpiar, el dato viejo vive a lo sumo lo que le quede.
  }
}

/**
 * Lee una tabla de la cache compartida.
 * @param {string} tabla
 * @return {?Array<!Object>} null si no esta en cache.
 * @private
 */
function leerDeCache_(tabla) {
  if (!CONFIG.CACHE_SEGUNDOS) return null;
  var texto = leerBloques_(claveCache_(tabla));
  if (texto === null) return null;
  try { return JSON.parse(texto); } catch (e) { return null; }
}

/**
 * Guarda una tabla en la cache compartida.
 * @param {string} tabla
 * @param {!Array<!Object>} filas
 * @private
 */
function guardarEnCache_(tabla, filas) {
  guardarBloques_(claveCache_(tabla), JSON.stringify(filas), segundosDeCache_(tabla));
}

/**
 * Descarta lo memorizado de una tabla. Se llama en cada escritura.
 * @param {string} tabla
 */
function invalidarTabla_(tabla) {
  delete MEMO_TABLAS[tabla];
  delete MEMO_ENCABEZADOS[tabla];
  // Los resultados calculados (indicadores, matriz, reportes) salen de estas
  // mismas tablas, asi que tambien quedan obsoletos.
  nuevaVersionDatos_();
  if (!CONFIG.CACHE_SEGUNDOS) return;
  borrarBloques_(claveCache_(tabla));
}

/* ================================================================== */
/* Cache de resultados ya calculados                                   */
/* ================================================================== */

/**
 * Los indicadores del Home, la matriz de iniciativas y los reportes no son una
 * lectura: son un calculo sobre todas las solicitudes y toda la bitacora. Hasta
 * ahora se rehacia en cada visita, aunque nadie hubiera cambiado nada. Cachear
 * las hojas evitaba releerlas, pero no evitaba recalcular.
 *
 * El resultado se guarda bajo un sello de version. Cada escritura cambia el
 * sello, con lo cual todas las entradas anteriores quedan inalcanzables de
 * golpe y expiran solas. No hace falta salir a borrarlas una por una, y no
 * existe el riesgo de olvidar alguna y servir un dato viejo.
 */

/** Sello de version memorizado en esta ejecucion. */
var MEMO_VERSION = null;

/** @return {string} Sello de version vigente. @private */
function versionDatos_() {
  if (MEMO_VERSION) return MEMO_VERSION;
  try {
    var cache = CacheService.getScriptCache();
    var v = cache.get('version_datos');
    if (!v) {
      v = String(new Date().getTime());
      cache.put('version_datos', v, CONFIG.CACHE_PARAMETRIZACION_SEGUNDOS);
    }
    MEMO_VERSION = v;
  } catch (e) {
    MEMO_VERSION = '0';
  }
  return MEMO_VERSION;
}

/**
 * Cambia el sello. Todo lo calculado con el anterior deja de usarse.
 * @private
 */
function nuevaVersionDatos_() {
  MEMO_VERSION = null;
  try {
    CacheService.getScriptCache().put('version_datos', String(new Date().getTime()),
                                      CONFIG.CACHE_PARAMETRIZACION_SEGUNDOS);
  } catch (e) {
    // Sin cache no hay nada que invalidar.
  }
}

/**
 * Devuelve el resultado ya calculado si esta en cache; si no, lo calcula, lo
 * guarda y lo devuelve.
 *
 * Solo debe usarse con resultados iguales para todos los usuarios: la cache es
 * del script, no de la sesion. Nada que dependa de quien pregunta entra aqui.
 *
 * @param {string} nombre Identifica el resultado, parametros incluidos.
 * @param {function(): *} calcular
 * @return {*}
 * @private
 */
function conResultadoEnCache_(nombre, calcular) {
  if (!CONFIG.CACHE_RESULTADOS_SEGUNDOS) return calcular();

  var prefijo = 'res_' + versionDatos_() + '_' + nombre;
  var texto = leerBloques_(prefijo);
  if (texto !== null) {
    try { return JSON.parse(texto); } catch (e) { /* cache corrupta: se recalcula */ }
  }

  var valor = calcular();
  guardarBloques_(prefijo, JSON.stringify(valor), CONFIG.CACHE_RESULTADOS_SEGUNDOS);
  return valor;
}

/**
 * Vacia toda la memoria. Util despues de editar las hojas a mano.
 * @return {!Object}
 */
function limpiarCache() {
  var tablas = Object.keys(ESQUEMA_PARAMETRIZACION).concat(Object.keys(ESQUEMA_TRANSACCIONAL));
  tablas.forEach(invalidarTabla_);
  nuevaVersionDatos_();
  MEMO_LIBROS = {};
  MEMO_TABLAS = {};
  MEMO_ENCABEZADOS = {};
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

  var total = function (lista) {
    return lista.reduce(function (a, x) { return a + (x.ms || 0); }, 0);
  };
  var resultado = {
    sinCache: frio,
    conCache: caliente,
    totalSinCacheMs: total(frio),
    totalConCacheMs: total(caliente),
    cacheSegundos: CONFIG.CACHE_SEGUNDOS,
    resultadosSegundos: CONFIG.CACHE_RESULTADOS_SEGUNDOS
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
