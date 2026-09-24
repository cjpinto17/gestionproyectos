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
  if (!segundos) return false;
  try {
    var bloques = Math.ceil(texto.length / CACHE_TAMANO_BLOQUE);
    // Algo enorme no vale la pena cachearlo: ocuparia toda la cache.
    if (bloques > 20) return false;

    var valores = {};
    for (var i = 0; i < bloques; i++) {
      valores[prefijo + '_' + i] =
          texto.substring(i * CACHE_TAMANO_BLOQUE, (i + 1) * CACHE_TAMANO_BLOQUE);
    }
    valores[prefijo] = JSON.stringify({ bloques: bloques });
    CacheService.getScriptCache().putAll(valores, segundos);
    return true;
  } catch (e) {
    return false;   // sin cache el sistema sigue funcionando, solo mas lento
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
  return guardarBloques_(claveCache_(tabla), JSON.stringify(filas), segundosDeCache_(tabla));
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

/**
 * Actualiza en la memoria compartida la fila que se acaba de escribir, en vez
 * de botar la tabla entera.
 *
 * La medicion sobre los datos reales fue clara: recalcular los indicadores
 * cuesta 300 ms, pero releer las hojas cuesta entre uno y tres segundos. Botar
 * la tabla en cada escritura obligaba a esa relectura completa, de modo que la
 * aplicacion quedaba lenta justo despues de que alguien trabajaba en ella, que
 * es cuando la estan usando.
 *
 * Como una escritura cambia una sola fila, se relee solo esa fila. Y se RELEE
 * de la hoja en lugar de copiar lo que acabamos de mandar: asi la copia en
 * memoria contiene exactamente lo que Google Sheets guardo, con sus propias
 * conversiones de fecha y de numero, y no una version parecida. Esa es la
 * diferencia entre una cache que acelera y una que miente.
 *
 * Las escrituras estan serializadas por LockService, asi que dos personas no
 * pueden parchar la misma copia a la vez. Lo que no pase por aqui —borrados,
 * reparaciones, cambios a mano en la hoja— sigue botando la tabla completa.
 *
 * @param {string} tabla
 * @param {number} numeroFila
 * @param {!Array<string>} columnas Encabezados reales de la hoja.
 * @private
 */
function refrescarFilaEnCache_(tabla, numeroFila, columnas) {
  // Los indicadores, la matriz y los reportes salen de esta tabla: cambiaron.
  nuevaVersionDatos_();
  delete MEMO_ENCABEZADOS[tabla];

  var filas = MEMO_TABLAS[tabla] || leerDeCache_(tabla);
  if (!filas) return;                     // no habia copia que actualizar

  var fila = leerFilaDeHoja_(tabla, numeroFila, columnas);
  if (!fila) { invalidarTabla_(tabla); return; }

  var copia = filas.slice();
  var indice = -1;
  for (var i = 0; i < copia.length; i++) {
    if (copia[i]._fila === numeroFila) { indice = i; break; }
  }
  if (indice === -1) copia.push(fila); else copia[indice] = fila;

  MEMO_TABLAS[tabla] = copia;
  // Si la tabla ya no cabe en cache, hay que borrar la copia vieja: dejarla
  // seria servir el dato anterior.
  if (!guardarEnCache_(tabla, copia)) borrarBloques_(claveCache_(tabla));
}

/**
 * Lee una sola fila de la hoja y la arma igual que lo haria leerTabla_().
 * @return {?Object} null si la fila quedo vacia.
 * @private
 */
function leerFilaDeHoja_(tabla, numeroFila, columnas) {
  var valores = getHoja_(tabla).getRange(numeroFila, 1, 1, columnas.length).getValues()[0];
  var obj = {};
  var vacia = true;
  for (var j = 0; j < columnas.length; j++) {
    if (!columnas[j]) continue;
    obj[columnas[j]] = normalizarValor_(valores[j]);
    if (obj[columnas[j]] !== '' && obj[columnas[j]] !== null) vacia = false;
  }
  if (vacia) return null;
  obj._fila = numeroFila;
  return obj;
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

/**
 * Arma un sello nuevo, garantizadamente distinto del que se le pase.
 *
 * La hora sola no sirve: dos sellos generados en el mismo milisegundo salen
 * iguales, y entonces una escritura no invalidaria lo calculado justo antes
 * —se seguiria sirviendo el dato viejo—. La cola al azar cierra esa puerta.
 *
 * @param {?string} anterior
 * @return {string}
 * @private
 */
function selloNuevo_(anterior) {
  var sello;
  do {
    sello = String(new Date().getTime()) + '-' + Math.floor(Math.random() * 1000000);
  } while (sello === anterior);
  return sello;
}

/** @return {string} Sello de version vigente. @private */
function versionDatos_() {
  if (MEMO_VERSION) return MEMO_VERSION;
  try {
    var cache = CacheService.getScriptCache();
    var v = cache.get('version_datos');
    if (!v) {
      v = selloNuevo_(null);
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
    var cache = CacheService.getScriptCache();
    cache.put('version_datos', selloNuevo_(cache.get('version_datos')),
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
  exigirOperador_();
  return limpiarCache_();
}

/**
 * El vaciado de verdad, sin guardia: lo usan por dentro el boton Actualizar
 * —que ya comprobo la sesion— y la medicion de rendimiento.
 * @return {!Object}
 * @private
 */
function limpiarCache_() {
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
  exigirOperador_();
  function medir(nombre, fn) {
    var t = new Date().getTime();
    try { fn(); } catch (e) { return { consulta: nombre, error: e.message }; }
    return { consulta: nombre, ms: new Date().getTime() - t };
  }

  limpiarCache_();
  var frio = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(CONFIG.VENTANA_HOME_MESES); })
  ];

  MEMO_TABLAS = {};   // se conserva la cache compartida, se borra la de ejecucion
  var caliente = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(CONFIG.VENTANA_HOME_MESES); })
  ];

  // Tercera corrida: como queda la aplicacion justo DESPUES de que alguien
  // mueve una tarjeta. Ese es el caso que de verdad vive el equipo, y el que
  // las dos corridas anteriores no alcanzan a ver.
  //
  // No se escribe nada en las hojas para medirlo: se reproduce el estado exacto
  // en que queda una escritura. Desde que la fila se parcha en vez de botar la
  // tabla, una escritura deja intactas las tablas en cache y solo invalida lo
  // calculado, que es precisamente lo que se hace aqui.
  MEMO_TABLAS = {};
  nuevaVersionDatos_();
  var trasEscritura = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(CONFIG.VENTANA_HOME_MESES); })
  ];

  var total = function (lista) {
    return lista.reduce(function (a, x) { return a + (x.ms || 0); }, 0);
  };
  var resultado = {
    sinCache: frio,
    conCache: caliente,
    trasEscritura: trasEscritura,
    totalSinCacheMs: total(frio),
    totalConCacheMs: total(caliente),
    totalTrasEscrituraMs: total(trasEscritura),
    calentamientoProgramado: hayCalentamientoProgramado_(),
    cacheSegundos: CONFIG.CACHE_SEGUNDOS,
    resultadosSegundos: CONFIG.CACHE_RESULTADOS_SEGUNDOS
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * @return {boolean} true si el calentamiento automatico ya quedo instalado.
 * @private
 */
function hayCalentamientoProgramado_() {
  try {
    return ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'calentarCache';
    });
  } catch (e) {
    return false;   // sin permiso para consultarlo; no es un error de medicion
  }
}

/* ================================================================== */
/* Mantener la cache tibia                                             */
/* ================================================================== */

/**
 * Rehace las consultas principales para que queden en cache.
 *
 * La medicion mostro que en frio las cuatro consultas suman cerca de seis
 * segundos, y en caliente un cuarto de segundo. La diferencia la paga quien
 * llegue primero despues de un rato sin movimiento: el primero de la manana,
 * tipicamente. Esta funcion existe para que ese primero no sea una persona.
 *
 * Solo lee. Pensada para un disparador de tiempo (ver instalarCalentamiento),
 * que corre a nombre del dueno del proyecto y sin usuario activo: por eso no
 * puede llamar a nada que dependa de quien pregunta.
 *
 * @return {!Object} Cuanto tardo cada consulta.
 */
function calentarCache() {
  function medir(nombre, fn) {
    var t = new Date().getTime();
    try { fn(); } catch (e) { return { consulta: nombre, error: e.message }; }
    return { consulta: nombre, ms: new Date().getTime() - t };
  }

  var pasos = [
    medir('getCatalogos', function () { return getCatalogos(); }),
    medir('getMatrizIniciativas', function () { return getMatrizIniciativas(); }),
    medir('getDatosKanban', function () { return getDatosKanban({}); }),
    medir('getMetricasHome', function () { return getMetricasHome(CONFIG.VENTANA_HOME_MESES); })
  ];

  var resultado = {
    cuando: Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, CONFIG.FORMATO_FECHA_HORA),
    pasos: pasos,
    totalMs: pasos.reduce(function (a, x) { return a + (x.ms || 0); }, 0)
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Programa el calentamiento cada diez minutos.
 *
 * Se ejecuta una sola vez, a mano, desde el editor de Apps Script. Borra antes
 * los disparadores anteriores de la misma funcion para no acumular copias si se
 * ejecuta dos veces.
 *
 * @return {!Object}
 */
function instalarCalentamiento() {
  exigirOperador_();
  var previos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'calentarCache') {
      ScriptApp.deleteTrigger(t);
      previos++;
    }
  });

  ScriptApp.newTrigger('calentarCache').timeBased().everyMinutes(10).create();

  var resultado = {
    ok: true,
    disparadoresAnterioresBorrados: previos,
    mensaje: 'Listo: la cache se refrescara sola cada 10 minutos. Puede verlo en ' +
             'Activadores (el reloj del menu de la izquierda).'
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Quita el calentamiento programado.
 * @return {!Object}
 */
function desinstalarCalentamiento() {
  exigirOperador_();
  var borrados = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'calentarCache') {
      ScriptApp.deleteTrigger(t);
      borrados++;
    }
  });
  var resultado = { ok: true, borrados: borrados,
                    mensaje: borrados ? 'Calentamiento desprogramado.'
                                      : 'No habia calentamiento programado.' };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
