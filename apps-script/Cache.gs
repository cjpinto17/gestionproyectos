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
  if (alimentaIndicadores_(tabla)) nuevaVersionDatos_();
  if (alimentaCatalogos_(tabla)) nuevaVersionCatalogos_();
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
  if (alimentaIndicadores_(tabla)) nuevaVersionDatos_();
  if (alimentaCatalogos_(tabla)) nuevaVersionCatalogos_();
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
 * Actualiza en la memoria compartida el orden de varias filas de una columna.
 *
 * Reordenar toca tantas filas como tarjetas tenga la columna. Botar la tabla
 * —lo que hace invalidarTabla_— obligaria a releer todas las hojas en la
 * siguiente consulta, que cuesta entre uno y tres segundos: el precio mas alto
 * por el cambio mas barato, y pagado justo cuando alguien esta trabajando en el
 * tablero. Releer fila por fila tampoco sirve: serian tantas idas a la hoja
 * como tarjetas.
 *
 * Aqui si se copia el valor que acabamos de escribir en vez de releerlo, al
 * contrario de refrescarFilaEnCache_. La razon de aquella advertencia es que
 * Google Sheets convierte fechas y decimales a su manera; un entero pequeno
 * vuelve tal cual, asi que no hay nada que la hoja pueda devolver distinto.
 *
 * Y NO se marca una version nueva de los datos: el orden de una columna no
 * entra en ningun indicador, matriz ni reporte. Rehacer todos los calculos
 * porque alguien subio una tarjeta un puesto seria tirar trabajo bueno.
 *
 * @param {!Object<number, number>} ordenPorFila Numero de fila -> orden nuevo.
 * @private
 */
function refrescarOrdenEnCache_(ordenPorFila) {
  var filas = MEMO_TABLAS['Solicitudes'] || leerDeCache_('Solicitudes');
  if (!filas) return;                     // no habia copia que actualizar

  var copia = filas.map(function (f) {
    if (ordenPorFila[f._fila] === undefined) return f;
    var c = {};
    Object.keys(f).forEach(function (k) { c[k] = f[k]; });
    c.Orden_Columna = ordenPorFila[f._fila];
    return c;
  });

  MEMO_TABLAS['Solicitudes'] = copia;
  // Si ya no cabe en cache hay que borrar la copia vieja: dejarla seria servir
  // el orden anterior.
  if (!guardarEnCache_('Solicitudes', copia)) borrarBloques_(claveCache_('Solicitudes'));
}

/**
 * Tablas cuyo contenido NO entra en ningun indicador, matriz ni reporte.
 *
 * Importa porque cada escritura sobre una tabla que si entra obliga a rehacer
 * todos los calculos para la siguiente persona que abra la aplicacion. El
 * seguimiento de una solicitud se escribe a diario y no mueve ni un indicador:
 * hacer que un comentario bote la matriz de iniciativas entera seria pagar el
 * costo mas alto por el cambio mas barato.
 */
var TABLAS_SIN_INDICADORES = ['Observaciones_Solicitud', 'Observaciones_Proyecto'];

/**
 * @param {string} tabla
 * @return {boolean} true si lo que se escribio puede cambiar un calculo.
 * @private
 */
function alimentaIndicadores_(tabla) {
  return TABLAS_SIN_INDICADORES.indexOf(tabla) === -1;
}

/**
 * Tablas de las que sale getCatalogos(), las unicas cuyo cambio obliga a
 * armarlo de nuevo. Si se agrega un catalogo a getCatalogos hay que agregar su
 * tabla aqui, o la aplicacion seguiria mostrando la lista vieja hasta que
 * venza la cache.
 */
var TABLAS_DE_CATALOGO = [
  'Proyectos', 'Usuarios', 'Roles', 'Plataforma_Digital', 'Lineas_Estrategicas',
  'Verticales', 'Causales_Bloqueo', 'Tipos_Solicitud', 'Tipos_Iniciativa'
];

/**
 * @param {string} tabla
 * @return {boolean} true si lo que se escribio cambia los catalogos.
 * @private
 */
function alimentaCatalogos_(tabla) {
  return TABLAS_DE_CATALOGO.indexOf(tabla) !== -1;
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

/** Sellos de version memorizados en esta ejecucion, por clave. */
var MEMO_SELLOS = {};

/** Sello de todo lo que se calcula a partir de las hojas. */
var SELLO_DATOS = 'version_datos';

/**
 * Sello aparte, solo para los catalogos.
 *
 * Los catalogos (iniciativas, usuarios, plataformas, roles, tipos...) no
 * dependen de las solicitudes, y las solicitudes son lo que el equipo escribe
 * todo el dia. Con un solo sello, mover una tarjeta botaba tambien los
 * catalogos, y entonces la siguiente persona que abriera la aplicacion pagaba
 * de nuevo las nueve lecturas de hoja que arman los catalogos —justo la espera
 * que se siente antes de que aparezca el Home—. Con dos sellos, una escritura
 * de solicitudes bota lo que de verdad cambio y deja los catalogos en pie.
 */
var SELLO_CATALOGOS = 'version_catalogos';

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

/**
 * Sello vigente de una clave.
 * @param {string} clave
 * @return {string}
 * @private
 */
function sello_(clave) {
  if (MEMO_SELLOS[clave]) return MEMO_SELLOS[clave];
  try {
    var cache = CacheService.getScriptCache();
    var v = cache.get(clave);
    if (!v) {
      v = selloNuevo_(null);
      cache.put(clave, v, CONFIG.CACHE_PARAMETRIZACION_SEGUNDOS);
    }
    MEMO_SELLOS[clave] = v;
  } catch (e) {
    MEMO_SELLOS[clave] = '0';
  }
  return MEMO_SELLOS[clave];
}

/**
 * Cambia un sello. Todo lo calculado con el anterior deja de usarse.
 * @param {string} clave
 * @private
 */
function nuevoSello_(clave) {
  delete MEMO_SELLOS[clave];
  try {
    var cache = CacheService.getScriptCache();
    cache.put(clave, selloNuevo_(cache.get(clave)),
              CONFIG.CACHE_PARAMETRIZACION_SEGUNDOS);
  } catch (e) {
    // Sin cache no hay nada que invalidar.
  }
}

/** @return {string} Sello de version vigente. @private */
function versionDatos_() { return sello_(SELLO_DATOS); }

/** Invalida todo lo calculado a partir de las hojas. @private */
function nuevaVersionDatos_() { nuevoSello_(SELLO_DATOS); }

/** @return {string} Sello vigente de los catalogos. @private */
function versionCatalogos_() { return sello_(SELLO_CATALOGOS); }

/** Invalida los catalogos ya armados. @private */
function nuevaVersionCatalogos_() { nuevoSello_(SELLO_CATALOGOS); }

/**
 * Devuelve el resultado ya calculado si esta en cache; si no, lo calcula, lo
 * guarda y lo devuelve.
 *
 * Solo debe usarse con resultados iguales para todos los usuarios: la cache es
 * del script, no de la sesion. Nada que dependa de quien pregunta entra aqui.
 *
 * @param {string} nombre Identifica el resultado, parametros incluidos.
 * @param {function(): *} calcular
 * @param {string=} sello Sello bajo el cual guardarlo. Por omision el de los
 *     datos, que cambia con cualquier escritura. Un resultado que solo depende
 *     de unas tablas puede pasar un sello mas estrecho y sobrevivir a las
 *     escrituras que no lo afectan.
 * @return {*}
 * @private
 */
function conResultadoEnCache_(nombre, calcular, sello) {
  if (!CONFIG.CACHE_RESULTADOS_SEGUNDOS) return calcular();

  var prefijo = 'res_' + (sello || versionDatos_()) + '_' + nombre;
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
  nuevaVersionCatalogos_();
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
  // Se cambia solo el sello de los datos, no el de los catalogos: eso es
  // exactamente lo que hace una escritura de solicitudes (D-99). Por eso
  // getCatalogos debe salir aqui casi en cero.
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
