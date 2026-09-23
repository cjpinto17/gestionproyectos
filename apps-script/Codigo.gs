/**
 * Codigo.gs
 * Backend de la aplicacion: entrada de la Web App, acceso a Google Sheets y
 * API que consume el frontend por google.script.run.
 *
 * Reglas transversales de este archivo:
 *   - Toda escritura pasa por LockService: dos personas moviendo tarjetas al
 *     mismo tiempo no pueden corromper la hoja.
 *   - Toda escritura valida permisos con Rbac.gs antes de tocar la hoja.
 *   - Todo cambio de fase o de estado deja rastro en Auditoria_Transiciones.
 */

/* ================================================================== */
/* 1. Entrada de la Web App                                            */
/* ================================================================== */

/**
 * Sirve la aplicacion.
 * @param {!Object} e Parametros de la peticion.
 * @return {!HtmlOutput}
 */
function doGet(e) {
  var plantilla = HtmlService.createTemplateFromFile('Index');
  plantilla.paginaInicial = (e && e.parameter && e.parameter.page) || 'home';
  return plantilla.evaluate()
      .setTitle(CONFIG.APP_NOMBRE + ' | ' + CONFIG.APP_SUBTITULO)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Receptor de webhooks entrantes (integraciones externas).
 * @param {!Object} e
 * @return {!TextOutput}
 */
function doPost(e) {
  var respuesta = { ok: false, error: 'Accion no reconocida' };
  try {
    var accion = e && e.parameter ? e.parameter.accion : '';
    if (accion === 'ping') respuesta = { ok: true, mensaje: 'activo' };
  } catch (err) {
    respuesta = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta))
      .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Permite componer los HTML parciales desde Index.html.
 * @param {string} archivo
 * @return {string}
 */
function include(archivo) {
  return HtmlService.createHtmlOutputFromFile(archivo).getContent();
}

/* ================================================================== */
/* 2. Sesion y contexto del usuario                                    */
/* ================================================================== */

/**
 * Identifica al usuario autenticado por SSO y resuelve su rol.
 * @return {!Object}
 */
function getContextoUsuario() {
  var correo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var dominio = getDominioCorporativo();

  if (!correo) {
    return { autorizado: false, motivo: 'No se pudo identificar la sesion de Google.' };
  }
  if (dominio && correo.indexOf('@' + dominio.replace('@', '')) === -1) {
    return { autorizado: false, correo: correo, motivo: 'Correo fuera del dominio corporativo.' };
  }

  // El correo es opcional en la tabla Usuarios: alguien puede existir y ser
  // asignable (por ejemplo como Business Owner) antes de tener cuenta
  // corporativa. Solo quien tenga correo registrado puede iniciar sesion.
  var usuarios = leerTabla('Usuarios');
  var usuario = null;
  for (var i = 0; i < usuarios.length; i++) {
    var registrado = String(usuarios[i].Correo_ID || '').toLowerCase();
    if (registrado && registrado === correo) { usuario = usuarios[i]; break; }
  }
  if (!usuario) {
    return { autorizado: false, correo: correo,
             motivo: 'Su correo no esta asociado a ningun usuario del sistema. ' +
                     'Solicite al administrador que lo registre.' };
  }
  if (String(usuario.Activo).toUpperCase() === 'NO') {
    return { autorizado: false, correo: correo, motivo: 'Usuario inactivo.' };
  }

  var permisos = getPermisos(usuario.Rol_ID);
  return {
    autorizado: true,
    correo: correo,
    idUsuario: usuario.ID_Usuario,
    nombre: usuario.Nombre_Completo,
    cargo: usuario.Cargo,
    area: usuario.Area,
    rolId: usuario.Rol_ID,
    rolNombre: nombreDeRol_(usuario.Rol_ID),
    esAdmin: esAdministrador(usuario.Rol_ID),
    puedeOperarTablero: puedeOperarTablero(usuario.Rol_ID),
    puedeEditarSolicitud: puedeEditarSolicitud(usuario.Rol_ID),
    fasesEditables: permisos.fases === TODAS
        ? FASES.map(function (f) { return f.id; })
        : permisos.fases
  };
}

/**
 * Igual que getContextoUsuario, pero lanza error si no esta autorizado.
 * Lo usan todas las operaciones de escritura.
 * @return {!Object}
 * @private
 */
function exigirSesion_() {
  var ctx = getContextoUsuario();
  if (!ctx.autorizado) throw new Error(ctx.motivo || 'Sesion no autorizada.');
  return ctx;
}

/** @private */
function nombreDeRol_(rolId) {
  for (var i = 0; i < ROLES.length; i++) {
    if (ROLES[i].id === rolId) return ROLES[i].nombre;
  }
  return rolId;
}

/* ================================================================== */
/* 3. Capa de acceso a datos                                           */
/* ================================================================== */

/** @private */
function getHoja_(tabla) {
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  var id = info.libro === 'PARAMETRIZACION'
      ? getIdLibroParametrizacion()
      : getIdLibroTransaccional();
  // getLibro_ abre cada archivo una sola vez por ejecucion (ver Cache.gs).
  var hoja = getLibro_(id).getSheetByName(tabla);
  if (!hoja) throw new Error('La hoja "' + tabla + '" no existe. Ejecute setupInicial().');
  return hoja;
}

/**
 * Lee una tabla completa como arreglo de objetos.
 * @param {string} tabla
 * @return {!Array<!Object>}
 */
function leerTabla(tabla) {
  if (MEMO_TABLAS[tabla]) return MEMO_TABLAS[tabla];

  var enCache = leerDeCache_(tabla);
  if (enCache) {
    MEMO_TABLAS[tabla] = enCache;
    return enCache;
  }

  var hoja = getHoja_(tabla);
  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 2) return [];

  var valores = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  var encabezados = valores[0];
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var obj = {};
    var vacia = true;
    for (var j = 0; j < encabezados.length; j++) {
      if (!encabezados[j]) continue;
      obj[encabezados[j]] = normalizarValor_(valores[i][j]);
      if (obj[encabezados[j]] !== '' && obj[encabezados[j]] !== null) vacia = false;
    }
    if (vacia) continue;              // ignora filas en blanco al final de la hoja
    obj._fila = i + 1;
    filas.push(obj);
  }

  MEMO_TABLAS[tabla] = filas;
  guardarEnCache_(tabla, filas);
  return filas;
}

/** Las fechas viajan como ISO para no perderse al cruzar a google.script.run. */
function normalizarValor_(valor) {
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

/**
 * Busca una fila por su llave primaria.
 * @param {string} tabla
 * @param {string} valorPk
 * @return {?Object} La fila, con _fila indicando su numero en la hoja.
 * @private
 */
function buscarPorPk_(tabla, valorPk) {
  var info = getDefinicionTabla(tabla);
  var pk = info.def.pk;
  var filas = leerTabla(tabla);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][pk]) === String(valorPk)) return filas[i];
  }
  return null;
}

/**
 * Escribe una fila completa respetando el orden de columnas del esquema.
 * @param {string} tabla
 * @param {number} numeroFila Fila real en la hoja.
 * @param {!Object} registro
 * @private
 */
function escribirFila_(tabla, numeroFila, registro) {
  // Se escribe segun los encabezados REALES de la hoja, no segun el orden del
  // esquema. Si el esquema gana una columna nueva y la hoja todavia no la
  // tiene, escribir por posicion correría todos los valores siguientes: la
  // fase caeria en la columna del estado, el estado en la del bloqueo, y asi.
  var columnas = asegurarColumnas_(tabla);
  var hoja = getHoja_(tabla);
  var valores = columnas.map(function (c) {
    var v = registro[c];
    return (v === undefined || v === null) ? '' : v;
  });
  hoja.getRange(numeroFila, 1, 1, columnas.length).setValues([valores]);
  invalidarTabla_(tabla);
}

/**
 * Devuelve los encabezados reales de la hoja, agregando antes las columnas que
 * el esquema declara y la hoja aun no tiene. Cada columna nueva se inserta en
 * la posicion que le corresponde, de modo que los datos ya escritos no se
 * desalinean: Google Sheets desplaza contenido, formatos y validaciones junto
 * con la insercion.
 *
 * @param {string} tabla
 * @return {!Array<string>} Encabezados de la hoja, ya alineados con el esquema.
 * @private
 */
function asegurarColumnas_(tabla) {
  if (MEMO_ENCABEZADOS[tabla]) return MEMO_ENCABEZADOS[tabla];

  var hoja = getHoja_(tabla);
  var esperados = getEncabezados(tabla);
  var ancho = Math.max(hoja.getLastColumn(), 1);
  var actuales = hoja.getRange(1, 1, 1, ancho).getValues()[0]
      .map(function (v) { return String(v || ''); });

  esperados.forEach(function (campo, i) {
    if (actuales.indexOf(campo) !== -1) return;
    var posicion = Math.min(i + 1, actuales.length + 1);
    if (posicion <= hoja.getMaxColumns()) {
      hoja.insertColumnBefore(posicion);
    } else {
      hoja.insertColumnsAfter(hoja.getMaxColumns(), 1);
    }
    hoja.getRange(1, posicion).setValue(campo)
        .setFontWeight('bold').setFontColor(CONFIG.COLORES.BLANCO)
        .setBackground(CONFIG.COLORES.NAVY);
    actuales.splice(posicion - 1, 0, campo);
    invalidarTabla_(tabla);
  });

  MEMO_ENCABEZADOS[tabla] = actuales;
  return actuales;
}

/**
 * Agrega una fila al final de la tabla.
 * @param {string} tabla
 * @param {!Object} registro
 * @return {number} Numero de fila escrita.
 * @private
 */
function agregarFila_(tabla, registro) {
  var hoja = getHoja_(tabla);
  var fila = Math.max(hoja.getLastRow() + 1, 2);
  escribirFila_(tabla, fila, registro);
  return fila;
}

/**
 * Convierte el texto de un campo de fecha del formulario en una fecha real.
 *
 * Los campos <input type="date"> entregan "aaaa-mm-dd", que JavaScript
 * interpreta como medianoche UTC. En Colombia (UTC-5) eso equivale a las 7 de
 * la noche del dia ANTERIOR: sin este tratamiento, toda fecha capturada se
 * guardaria corrida un dia hacia atras.
 *
 * @param {*} valor
 * @return {Date|string} La fecha en horario local, o '' si venia vacia.
 * @private
 */
function aFechaDeFormulario_(valor) {
  if (!valor) return '';
  if (valor instanceof Date) return valor;
  var texto = String(valor).trim();
  var soloFecha = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) {
    return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  }
  var d = aFecha_(texto);
  return d || '';
}

/**
 * Normaliza las fechas de un registro segun el esquema de su tabla.
 * @param {string} tabla
 * @param {!Object} registro
 * @return {!Object} El mismo registro, con las fechas convertidas.
 * @private
 */
function normalizarFechas_(tabla, registro) {
  getDefinicionTabla(tabla).def.columnas.forEach(function (c) {
    if (c.tipo !== 'date' && c.tipo !== 'datetime') return;
    if (registro[c.campo] === undefined) return;
    registro[c.campo] = aFechaDeFormulario_(registro[c.campo]);
  });
  return registro;
}

/**
 * Valida un registro contra el esquema: obligatorios y tipos basicos.
 * @param {string} tabla
 * @param {!Object} registro
 * @param {boolean} esNuevo
 * @private
 */
function validarRegistro_(tabla, registro, esNuevo) {
  var info = getDefinicionTabla(tabla);
  var errores = [];

  info.def.columnas.forEach(function (col) {
    var valor = registro[col.campo];
    var vacio = (valor === undefined || valor === null || String(valor).trim() === '');

    if (col.requerido && vacio) {
      errores.push('"' + col.etiqueta + '" es obligatorio.');
      return;
    }
    if (vacio) return;

    if (col.tipo === 'number' || col.tipo === 'decimal') {
      if (isNaN(Number(valor))) errores.push('"' + col.etiqueta + '" debe ser numerico.');
    }
    if (col.tipo === 'email' && String(valor).indexOf('@') === -1) {
      errores.push('"' + col.etiqueta + '" debe ser un correo valido.');
    }
    if (col.tipo === 'boolSN') {
      var v = String(valor).toUpperCase();
      if (v !== 'SI' && v !== 'SÍ' && v !== 'NO') {
        errores.push('"' + col.etiqueta + '" debe ser SI o NO.');
      }
    }
    if (col.opciones && col.opciones.indexOf(valor) === -1) {
      errores.push('"' + col.etiqueta + '" debe ser uno de: ' + col.opciones.join(', '));
    }
  });

  if (esNuevo) {
    var pk = info.def.pk;
    if (registro[pk] && buscarPorPk_(tabla, registro[pk])) {
      errores.push('Ya existe un registro con la llave ' + registro[pk] + '.');
    }
  }
  if (errores.length) throw new Error(errores.join(' '));
}

/**
 * Ejecuta una operacion tomando el bloqueo del script.
 * @param {function(): *} operacion
 * @return {*}
 * @private
 */
function conBloqueo_(operacion) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('El sistema esta ocupado atendiendo otro cambio. Intente de nuevo.');
  }
  try {
    return operacion();
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================== */
/* 4. Catalogos                                                        */
/* ================================================================== */

/**
 * Devuelve todos los catalogos en una sola llamada.
 * @return {!Object}
 */
function getCatalogos() {
  return {
    proyectos: leerTabla('Proyectos'),
    plataformas: PLATAFORMAS,
    usuarios: leerTabla('Usuarios'),
    fases: FASES,
    estados: ESTADOS,
    estadosIniciativa: ESTADOS_INICIATIVA,
    tipos: TIPOS_SOLICITUD,
    tiposIniciativa: TIPOS_INICIATIVA,
    prioridades: PRIORIDADES,
    causales: CAUSALES_BLOQUEO,
    roles: ROLES,
    lineasEstrategicas: LINEAS_ESTRATEGICAS,
    verticales: VERTICALES
  };
}

/**
 * Descarta la memoria compartida y obliga a releer las hojas.
 * Lo usa el boton "Actualizar": hace falta cuando alguien edita el Google
 * Sheets por fuera de la aplicacion.
 * @return {!Object}
 */
function refrescarDatos() {
  exigirSesion_();
  limpiarCache();
  return { ok: true };
}

/**
 * Datos de arranque de la aplicacion en una sola llamada.
 *
 * Cada viaje al servidor de Apps Script cuesta cerca de un segundo solo en ida
 * y vuelta. Pedir sesion, catalogos e indicadores por separado son tres esperas
 * encadenadas antes de que aparezca la primera pantalla; juntos son una sola.
 *
 * @param {number=} meses Ventana de los indicadores del Home.
 * @return {!Object} { contexto, catalogos, metricas }
 */
function getArranque(meses) {
  var contexto = getContextoUsuario();
  if (!contexto.autorizado) return { contexto: contexto };
  return {
    contexto: contexto,
    catalogos: getCatalogos(),
    metricas: getMetricasHome(meses || 12)
  };
}

/* ================================================================== */
/* 5. Solicitudes: lectura                                             */
/* ================================================================== */

/**
 * Datos del tablero Kanban: solicitudes filtradas y enriquecidas con los
 * nombres que muestra la tarjeta, mas los catalogos de los filtros.
 * @param {!Object=} filtros
 * @return {!Object}
 */
function getDatosKanban(filtros) {
  var proyectos = leerTabla('Proyectos');
  var usuarios = leerTabla('Usuarios');
  var nombrePlataforma = mapaPlataformas();
  var nombreProyecto = {}, nombreUsuario = {};
  proyectos.forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  usuarios.forEach(function (u) { nombreUsuario[u.ID_Usuario] = u.Nombre_Completo; });

  var solicitudes = getSolicitudes(filtros).map(function (s) {
    s.Nombre_Iniciativa = nombreProyecto[s.ID_Proyecto] || s.ID_Proyecto;
    s.Nombre_Responsable = nombreUsuario[s.Responsable_ID] || '';
    s.Nombre_Plataforma = nombrePlataforma[s.Plataforma_ID] || s.Plataforma_ID;
    return s;
  });

  return {
    solicitudes: solicitudes,
    proyectos: proyectos,
    usuarios: usuarios,
    plataformas: PLATAFORMAS,
    fases: FASES,
    estados: ESTADOS,
    tipos: TIPOS_SOLICITUD,
    prioridades: PRIORIDADES,
    causales: CAUSALES_BLOQUEO,
    versiones: getVersionesDisponibles()
  };
}

/**
 * Lista las solicitudes aplicando filtros opcionales.
 * @param {!Object=} filtros { idProyecto, plataforma, responsable, texto }
 * @return {!Array<!Object>}
 */
function getSolicitudes(filtros) {
  var f = filtros || {};
  return leerTabla('Solicitudes').filter(function (s) {
    if (f.idProyecto && s.ID_Proyecto !== f.idProyecto) return false;
    if (f.plataforma && s.Plataforma_ID !== f.plataforma) return false;
    if (f.responsable && s.Responsable_ID !== f.responsable) return false;
    if (f.texto) {
      var aguja = String(f.texto).toLowerCase();
      var pajar = (String(s.ID_Solicitud) + ' ' + String(s.Nombre_Solicitud)).toLowerCase();
      if (pajar.indexOf(aguja) === -1) return false;
    }
    return true;
  });
}

/**
 * Detalle completo de una solicitud, con nombres resueltos.
 * @param {string} idSolicitud
 * @return {!Object}
 */
function getDetalleSolicitud(idSolicitud) {
  var s = buscarPorPk_('Solicitudes', idSolicitud);
  if (!s) throw new Error('No existe la solicitud ' + idSolicitud + '.');

  var nombreProyecto = {}, nombreUsuario = {};
  leerTabla('Proyectos').forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  leerTabla('Usuarios').forEach(function (u) { nombreUsuario[u.ID_Usuario] = u.Nombre_Completo; });

  s.Nombre_Iniciativa = nombreProyecto[s.ID_Proyecto] || s.ID_Proyecto;
  s.Nombre_Responsable = nombreUsuario[s.Responsable_ID] || '';
  s.Nombre_Solicitante = nombreUsuario[s.Solicitante_ID] || '';
  s.Nombre_Plataforma = mapaPlataformas()[s.Plataforma_ID] || s.Plataforma_ID;
  s.Historial = leerTabla('Auditoria_Transiciones')
      .filter(function (a) { return a.ID_Solicitud === idSolicitud; })
      .sort(function (a, b) {
        return String(b.Fecha_Hora_Cambio).localeCompare(String(a.Fecha_Hora_Cambio));
      });
  return s;
}

/**
 * Deja en el registro solo el codigo de la version.
 *
 * La lista del formulario muestra "Banca Movil · v2.4.0 (Planeada)" para que
 * la persona sepa cual elegir, pero en la hoja debe quedar unicamente el
 * codigo. Esto protege el dato si alguna vez llega la etiqueta completa, por
 * ejemplo pegada desde otra pantalla.
 *
 * @param {*} valor
 * @return {string}
 * @private
 */
function limpiarVersion_(valor) {
  var texto = String(valor || '').trim();
  if (!texto) return '';
  // En la etiqueta el codigo va despues de la plataforma: "Banca Movil · v2.4.0".
  var partes = texto.split('·');
  var codigo = partes[partes.length - 1];
  return codigo.replace(/\s*\(.*\)\s*$/, '').trim();
}

/**
 * Comprueba que la version elegida exista en el roadmap.
 *
 * Antes se exigia el formato vX.Y.Z, y eso rechazaba versiones que el propio
 * negocio habia registrado con otra nomenclatura: el sistema le decia que su
 * parametrizacion estaba mal. El catalogo es la fuente de verdad, asi que lo
 * que se valida es que la version exista, no como se escribe.
 *
 * @param {string} version
 * @param {string} idPlataforma
 * @private
 */
function validarVersionRoadmap_(version, idPlataforma) {
  if (!version) return;
  var disponibles = getVersionesDisponibles(idPlataforma);
  var existe = disponibles.some(function (v) { return v.valor === version; });
  if (existe) return;

  var nombrePlataforma = mapaPlataformas()[idPlataforma] || idPlataforma;
  throw new Error('La version "' + version + '" no esta registrada en el roadmap de ' +
                  nombrePlataforma + '. Registrela en Administracion > Roadmap de versiones ' +
                  'y vuelva a intentarlo.');
}

/**
 * Versiones registradas en el roadmap, para ofrecerlas en el formulario en
 * lugar de que cada quien escriba la suya.
 * @param {string=} idPlataforma Si se indica, solo las de esa plataforma.
 * @return {!Array<{valor: string, texto: string}>}
 */
function getVersionesDisponibles(idPlataforma) {
  var nombrePlataforma = mapaPlataformas();
  var vistas = {};
  var lista = [];

  leerTabla('Roadmap_Versiones').forEach(function (v) {
    if (!v.Numero_Version) return;
    if (idPlataforma && v.Plataforma_ID !== idPlataforma) return;
    var clave = v.Plataforma_ID + '|' + v.Numero_Version;
    if (vistas[clave]) return;
    vistas[clave] = true;
    lista.push({
      valor: v.Numero_Version,
      texto: (nombrePlataforma[v.Plataforma_ID] || v.Plataforma_ID) + ' · ' + v.Numero_Version +
             (v.Estado_Release ? ' (' + v.Estado_Release + ')' : '')
    });
  });

  lista.sort(function (a, b) { return String(a.valor).localeCompare(String(b.valor), 'es'); });
  return lista;
}

/* ================================================================== */
/* 6. Solicitudes: escritura                                           */
/* ================================================================== */

/**
 * Genera el consecutivo SOL-YYYYMMDD-XXX del dia.
 * @return {string}
 * @private
 */
function generarIdSolicitud_() {
  var hoy = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyyMMdd');

  // El consecutivo continua la serie de toda la hoja, no se reinicia cada dia:
  // asi el numero identifica la solicitud por si solo y nunca se repite, aunque
  // dos se registren el mismo dia con semanas de diferencia.
  var maximo = 0;
  leerTabla('Solicitudes').forEach(function (s) {
    var m = String(s.ID_Solicitud || '').match(/(\d+)\s*$/);
    if (m) maximo = Math.max(maximo, Number(m[1]));
  });

  var siguiente = maximo + 1;
  var relleno = siguiente < 1000 ? ('00' + siguiente).slice(-3) : String(siguiente);
  return CONFIG.PREFIJO_SOLICITUD + '-' + hoy + '-' + relleno;
}

/**
 * Siguiente numero de orden dentro de una iniciativa.
 * El orden no se pide en el formulario: la solicitud nueva entra al final de
 * la fila de su iniciativa, y desde ahi el negocio la reordena si hace falta.
 * @param {string} idProyecto
 * @return {number}
 * @private
 */
function siguienteOrdenIniciativa_(idProyecto) {
  var maximo = 0;
  leerTabla('Solicitudes').forEach(function (s) {
    if (s.ID_Proyecto !== idProyecto) return;
    var n = Number(s.Orden_Iniciativa);
    if (!isNaN(n)) maximo = Math.max(maximo, n);
  });
  return maximo + 1;
}

/**
 * Registra una nueva solicitud: valida, asigna ID, crea la carpeta en Drive
 * con el documento de requerimiento, escribe la fila, registra la auditoria
 * inicial y notifica.
 *
 * @param {!Object} datos Campos del formulario.
 * @return {!Object} { ok, idSolicitud, carpetaUrl, docUrl, avisos }
 */
function crearSolicitud(datos) {
  var ctx = exigirSesion_();

  return conBloqueo_(function () {
    var ahora = new Date();
    var id = generarIdSolicitud_();

    var registro = {
      ID_Solicitud: id,
      Fecha_Registro: ahora,
      Nombre_Solicitud: (datos.Nombre_Solicitud || '').trim(),
      Objetivo: datos.Objetivo || '',
      Entregable: datos.Entregable || '',
      ID_Proyecto: datos.ID_Proyecto || '',
      Plataforma_ID: datos.Plataforma_ID || '',
      Solicitante_ID: datos.Solicitante_ID || ctx.idUsuario,
      Tipo_Solicitud: datos.Tipo_Solicitud || '',
      Prioridad: datos.Prioridad || '',
      Orden_Iniciativa: siguienteOrdenIniciativa_(datos.ID_Proyecto),
      Proceso_Impactado: datos.Proceso_Impactado || '',
      // Si la persona ya tiene el documento en Drive se conserva su enlace y no
      // se clona la plantilla: quedaria un duplicado vacio al lado del bueno.
      Doc_Requerimiento_URL: String(datos.Doc_Requerimiento_URL || '').trim(),
      Carpeta_Drive_URL: '',
      Fase_Actual: 'FAS-01',
      Estado_Actual: 'EST-01',
      Tiene_Bloqueo: 'NO',
      Causal_Bloqueo: '',
      Observacion_Bloqueo: '',
      Link_Taiga: datos.Link_Taiga || '',
      Version_Semantica: limpiarVersion_(datos.Version_Semantica),
      Responsable_ID: datos.Responsable_ID || ctx.idUsuario,
      Fecha_Ultimo_Cambio: ahora
    };
    validarRegistro_('Solicitudes', registro, true);
    validarVersionRoadmap_(registro.Version_Semantica, registro.Plataforma_ID);

    // La iniciativa debe existir: toda solicitud es hija de una iniciativa.
    if (!buscarPorPk_('Proyectos', registro.ID_Proyecto)) {
      throw new Error('La iniciativa ' + registro.ID_Proyecto + ' no existe.');
    }

    var docPropio = !!registro.Doc_Requerimiento_URL;
    if (docPropio && !/^https?:\/\//i.test(registro.Doc_Requerimiento_URL)) {
      throw new Error('El enlace del documento debe empezar por http:// o https://');
    }

    var avisos = [];
    var contenedor = { carpetaUrl: '', docUrl: '' };
    // Cuando la persona trae el enlace de su documento no se toca Drive: no se
    // crea carpeta ni se clona plantilla. El sistema solo guarda y muestra ese
    // enlace, que es donde el equipo ya esta trabajando.
    if (!docPropio) {
      try {
        contenedor = crearContenedorDrive_(id, registro.Plataforma_ID, registro.Nombre_Solicitud);
        registro.Carpeta_Drive_URL = contenedor.carpetaUrl;
        registro.Doc_Requerimiento_URL = contenedor.docUrl;
      } catch (e) {
        // La solicitud no se pierde por un problema de Drive: se avisa y sigue.
        avisos.push('No se pudo crear la carpeta en Drive: ' + e.message);
      }
    }

    agregarFila_('Solicitudes', registro);

    registrarTransicionAudit({
      idSolicitud: id,
      faseOrigen: '',
      faseDestino: 'FAS-01',
      estadoOrigen: '',
      estadoDestino: 'EST-01',
      desde: ahora,
      correoUsuario: ctx.correo
    });

    avisos = avisos.concat(notificar_(registro, 'creacion'));

    return { ok: true, idSolicitud: id, carpetaUrl: contenedor.carpetaUrl,
             docUrl: contenedor.docUrl, avisos: avisos };
  });
}

/**
 * Actualiza campos de una solicitud respetando el RBAC por campo.
 * @param {string} idSolicitud
 * @param {!Object} cambios Mapa campo -> valor nuevo.
 * @return {!Object}
 */
function actualizarSolicitud(idSolicitud, cambios) {
  var ctx = exigirSesion_();

  return conBloqueo_(function () {
    var actual = buscarPorPk_('Solicitudes', idSolicitud);
    if (!actual) throw new Error('No existe la solicitud ' + idSolicitud + '.');

    var negados = [];
    Object.keys(cambios).forEach(function (campo) {
      if (!puedeEditarCampo(ctx.rolId, campo)) negados.push(campo);
    });
    if (negados.length) {
      throw new Error('Su rol no puede modificar: ' + negados.join(', ') + '.');
    }

    if (cambios.Version_Semantica !== undefined) {
      cambios.Version_Semantica = limpiarVersion_(cambios.Version_Semantica);
      validarVersionRoadmap_(cambios.Version_Semantica,
                             cambios.Plataforma_ID || actual.Plataforma_ID);
    }

    var nuevo = {};
    Object.keys(actual).forEach(function (k) { if (k !== '_fila') nuevo[k] = actual[k]; });
    Object.keys(cambios).forEach(function (k) { nuevo[k] = cambios[k]; });

    validarRegistro_('Solicitudes', nuevo, false);
    escribirFila_('Solicitudes', actual._fila, nuevo);

    if (cambios.Version_Semantica) sincronizarRoadmap_(nuevo);
    return { ok: true, idSolicitud: idSolicitud };
  });
}

/** Campos que administra el sistema y no se editan a mano. */
var CAMPOS_NO_EDITABLES = ['ID_Solicitud', 'Carpeta_Drive_URL', 'Fecha_Ultimo_Cambio'];

/**
 * Devuelve el formulario de edicion de una solicitud: sus columnas editables,
 * las listas desplegables resueltas y los valores actuales.
 * @param {string} idSolicitud
 * @return {!Object}
 */
function getFormularioSolicitud(idSolicitud) {
  var ctx = exigirSesion_();
  if (!puedeEditarSolicitud(ctx.rolId)) {
    throw new Error('Su rol no puede editar solicitudes.');
  }

  var s = buscarPorPk_('Solicitudes', idSolicitud);
  if (!s) throw new Error('No existe la solicitud ' + idSolicitud + '.');

  var columnas = getDefinicionTabla('Solicitudes').def.columnas.filter(function (c) {
    return CAMPOS_NO_EDITABLES.indexOf(c.campo) === -1;
  });
  var opciones = opcionesDeReferencia_(columnas);
  opciones.Version_Semantica = getVersionesDisponibles(s.Plataforma_ID);

  return { idSolicitud: idSolicitud, columnas: columnas, opciones: opciones, valores: s };
}

/**
 * Resuelve la fecha de registro que queda tras una edicion.
 *
 * La fecha de registro es editable porque la que quedo puede no ser la real:
 * en la carga inicial y en las migraciones se registro el dia en que el dato
 * entro al sistema, no el dia en que el negocio recibio la solicitud. De ella
 * dependen el Lead Time y la antiguedad, asi que conviene poder corregirla.
 *
 * Dos cuidados:
 *  - El formulario entrega solo el dia (aaaa-mm-dd), sin hora. Si el dia no
 *    cambio se conserva la estampa original completa; de lo contrario, guardar
 *    cualquier otro campo iria borrando la hora de registro.
 *  - No se acepta una fecha futura: daria Lead Time negativo y ensuciaria todos
 *    los indicadores.
 *
 * @param {*} valorNuevo Lo que viene del formulario.
 * @param {*} valorActual Lo que hay hoy en la hoja.
 * @return {!Date}
 * @private
 */
function fechaRegistroEditada_(valorNuevo, valorActual) {
  var nueva = aFechaDeFormulario_(valorNuevo);
  if (!nueva) throw new Error('La fecha de registro es obligatoria.');

  var anterior = aFecha_(valorActual);
  if (anterior && mismoDia_(nueva, anterior)) return anterior;

  var ahora = new Date();
  if (nueva.getTime() > ahora.getTime()) {
    throw new Error('La fecha de registro no puede ser futura.');
  }
  return nueva;
}

/**
 * @param {!Date} a
 * @param {!Date} b
 * @return {boolean} true si caen en el mismo dia calendario local.
 * @private
 */
function mismoDia_(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/**
 * Guarda la edicion completa de una solicitud.
 *
 * Si el cambio incluye la fase o el estado, queda registrado en la bitacora
 * igual que un arrastre en el tablero: la trazabilidad no depende de por donde
 * se haya hecho el cambio.
 *
 * @param {string} idSolicitud
 * @param {!Object} datos
 * @return {!Object}
 */
function actualizarSolicitudCompleta(idSolicitud, datos) {
  var ctx = exigirSesion_();
  if (!puedeEditarSolicitud(ctx.rolId)) {
    throw new Error('Su rol no puede editar solicitudes.');
  }

  return conBloqueo_(function () {
    var actual = buscarPorPk_('Solicitudes', idSolicitud);
    if (!actual) throw new Error('No existe la solicitud ' + idSolicitud + '.');

    var nuevo = {};
    Object.keys(actual).forEach(function (k) { if (k !== '_fila') nuevo[k] = actual[k]; });
    Object.keys(datos).forEach(function (k) {
      if (CAMPOS_NO_EDITABLES.indexOf(k) === -1) nuevo[k] = datos[k];
    });

    nuevo.Fecha_Registro = fechaRegistroEditada_(nuevo.Fecha_Registro, actual.Fecha_Registro);
    nuevo.Version_Semantica = limpiarVersion_(nuevo.Version_Semantica);
    validarVersionRoadmap_(nuevo.Version_Semantica, nuevo.Plataforma_ID);
    var bloqueo = String(nuevo.Tiene_Bloqueo || 'NO').toUpperCase().indexOf('S') === 0 ? 'SI' : 'NO';
    nuevo.Tiene_Bloqueo = bloqueo;
    if (bloqueo === 'SI' && !nuevo.Causal_Bloqueo) {
      throw new Error('La solicitud queda bloqueada: indique la causal.');
    }
    if (bloqueo === 'NO') {
      nuevo.Causal_Bloqueo = '';
      nuevo.Observacion_Bloqueo = '';
    }

    normalizarFechas_('Solicitudes', nuevo);
    validarRegistro_('Solicitudes', nuevo, false);

    var cambioFase = nuevo.Fase_Actual !== actual.Fase_Actual;
    var cambioEstado = nuevo.Estado_Actual !== actual.Estado_Actual;
    if (cambioFase || cambioEstado) nuevo.Fecha_Ultimo_Cambio = new Date();

    escribirFila_('Solicitudes', actual._fila, nuevo);

    if (cambioFase || cambioEstado) {
      registrarTransicionAudit({
        idSolicitud: idSolicitud,
        faseOrigen: actual.Fase_Actual,
        faseDestino: nuevo.Fase_Actual,
        estadoOrigen: actual.Estado_Actual,
        estadoDestino: nuevo.Estado_Actual,
        desde: aFecha_(actual.Fecha_Ultimo_Cambio) || aFecha_(actual.Fecha_Registro),
        correoUsuario: ctx.correo + ' (edicion)'
      });
    }
    if (nuevo.Version_Semantica) sincronizarRoadmap_(nuevo);

    return { ok: true, idSolicitud: idSolicitud, huboTransicion: cambioFase || cambioEstado };
  });
}

/**
 * Mueve una solicitud de fase (arrastre en el Kanban o boton de avance).
 * Valida la transicion, sella las estampas de tiempo de la fase destino y
 * registra la auditoria inmutable.
 *
 * @param {string} idSolicitud
 * @param {string} faseDestino
 * @param {string=} estadoDestino
 * @return {!Object}
 */
function cambiarFaseSolicitud(idSolicitud, faseDestino, estadoDestino) {
  var ctx = exigirSesion_();

  return conBloqueo_(function () {
    var s = buscarPorPk_('Solicitudes', idSolicitud);
    if (!s) throw new Error('No existe la solicitud ' + idSolicitud + '.');

    var validacion = validarTransicion(ctx.rolId, s.Fase_Actual, faseDestino);
    if (!validacion.permitido) throw new Error(validacion.motivo);

    if (String(s.Tiene_Bloqueo).toUpperCase().indexOf('S') === 0) {
      throw new Error('La solicitud esta bloqueada. Levante el bloqueo antes de avanzarla.');
    }

    var ahora = new Date();
    var faseOrigen = s.Fase_Actual;
    var estadoOrigen = s.Estado_Actual;
    var nuevoEstado = estadoDestino || estadoSugerido_(faseDestino, estadoOrigen);

    var nuevo = {};
    Object.keys(s).forEach(function (k) { if (k !== '_fila') nuevo[k] = s[k]; });
    nuevo.Fase_Actual = faseDestino;
    nuevo.Estado_Actual = nuevoEstado;
    nuevo.Fecha_Ultimo_Cambio = ahora;
    sellarEstampas_(nuevo, faseOrigen, faseDestino, ahora);

    escribirFila_('Solicitudes', s._fila, nuevo);

    registrarTransicionAudit({
      idSolicitud: idSolicitud,
      faseOrigen: faseOrigen,
      faseDestino: faseDestino,
      estadoOrigen: estadoOrigen,
      estadoDestino: nuevoEstado,
      desde: aFecha_(s.Fecha_Ultimo_Cambio) || aFecha_(s.Fecha_Registro),
      correoUsuario: ctx.correo
    });

    if (faseDestino === 'FAS-08') sincronizarRoadmap_(nuevo);
    var avisos = notificar_(nuevo, 'cambio_fase');

    return { ok: true, idSolicitud: idSolicitud, faseActual: faseDestino,
             estadoActual: nuevoEstado, avisos: avisos };
  });
}

/**
 * Estado por defecto al llegar a una fase, cuando el usuario no elige uno.
 * @private
 */
function estadoSugerido_(faseDestino, estadoOrigen) {
  if (faseDestino === 'FAS-08') return 'EST-06';   // Terminada
  if (estadoOrigen === 'EST-01') return 'EST-02';  // arranca el trabajo
  return estadoOrigen === 'EST-04' ? 'EST-02' : (estadoOrigen || 'EST-02');
}

/**
 * Escribe la estampa de tiempo que corresponde a la fase que se cierra y a la
 * que se abre.
 * @private
 */
function sellarEstampas_(registro, faseOrigen, faseDestino, ahora) {
  var inicio = {
    'FAS-03': 'Fecha_Inicio_Analisis', 'FAS-04': 'Fecha_Inicio_Dev',
    'FAS-05': 'Fecha_Inicio_QA', 'FAS-06': 'Fecha_Inicio_UAT',
    'FAS-07': 'Fecha_Socializacion', 'FAS-08': 'Fecha_Despliegue'
  };
  var fin = {
    'FAS-03': 'Fecha_Fin_Analisis', 'FAS-04': 'Fecha_Fin_Dev',
    'FAS-05': 'Fecha_Fin_QA', 'FAS-06': 'Fecha_Fin_UAT'
  };
  if (fin[faseOrigen]) registro[fin[faseOrigen]] = ahora;
  if (inicio[faseDestino]) registro[inicio[faseDestino]] = ahora;
}

/**
 * Activa o levanta el bloqueo de una solicitud.
 * @param {string} idSolicitud
 * @param {boolean} bloqueada
 * @param {string=} idCausal Obligatorio cuando bloqueada es true.
 * @param {string=} observacion Detalle libre de que esta trabando la solicitud.
 * @return {!Object}
 */
function marcarBloqueo(idSolicitud, bloqueada, idCausal, observacion) {
  var ctx = exigirSesion_();

  return conBloqueo_(function () {
    var s = buscarPorPk_('Solicitudes', idSolicitud);
    if (!s) throw new Error('No existe la solicitud ' + idSolicitud + '.');
    if (!puedeOperarTablero(ctx.rolId)) {
      throw new Error('Solo el Product Owner y el Administrador pueden marcar bloqueos.');
    }
    if (bloqueada && !idCausal) {
      throw new Error('Debe indicar la causal del bloqueo.');
    }
    var nota = String(observacion || '').trim();

    var ahora = new Date();
    var estadoOrigen = s.Estado_Actual;
    var nuevo = {};
    Object.keys(s).forEach(function (k) { if (k !== '_fila') nuevo[k] = s[k]; });
    nuevo.Tiene_Bloqueo = bloqueada ? 'SI' : 'NO';
    nuevo.Causal_Bloqueo = bloqueada ? idCausal : '';
    // Al levantar el bloqueo la observacion se limpia: describe una situacion
    // que ya termino, y dejarla haria creer que la solicitud sigue trabada.
    nuevo.Observacion_Bloqueo = bloqueada ? nota : '';
    nuevo.Estado_Actual = bloqueada ? 'EST-04' : 'EST-02';
    nuevo.Fecha_Ultimo_Cambio = ahora;

    escribirFila_('Solicitudes', s._fila, nuevo);

    // El bloqueo tambien se audita: de ahi sale el tiempo bloqueado que
    // descuenta la eficiencia de flujo.
    registrarTransicionAudit({
      idSolicitud: idSolicitud,
      faseOrigen: s.Fase_Actual,
      faseDestino: s.Fase_Actual,
      estadoOrigen: estadoOrigen,
      estadoDestino: nuevo.Estado_Actual,
      desde: aFecha_(s.Fecha_Ultimo_Cambio) || aFecha_(s.Fecha_Registro),
      correoUsuario: ctx.correo
    });

    var avisos = bloqueada ? notificar_(nuevo, 'bloqueo') : [];
    return { ok: true, idSolicitud: idSolicitud, bloqueada: bloqueada, avisos: avisos };
  });
}

/**
 * Mantiene el roadmap alineado: al asignar una version o desplegar, crea o
 * actualiza la fila correspondiente en Roadmap_Versiones.
 * @private
 */
function sincronizarRoadmap_(solicitud) {
  var version = solicitud.Version_Semantica;
  var plataforma = solicitud.Plataforma_ID;
  if (!version || !plataforma) return;

  var existente = null;
  leerTabla('Roadmap_Versiones').forEach(function (v) {
    if (v.Numero_Version === version && v.Plataforma_ID === plataforma) existente = v;
  });

  var desplegada = solicitud.Fase_Actual === 'FAS-08';
  if (!existente) {
    agregarFila_('Roadmap_Versiones', {
      ID_Version: 'VER-' + new Date().getTime(),
      Plataforma_ID: plataforma,
      Numero_Version: version,
      Estado_Release: desplegada ? 'En Produccion' : 'Planeada',
      Fecha_Planeada: '',
      Fecha_Despliegue_Real: desplegada ? new Date() : ''
    });
    return;
  }
  if (desplegada && !existente.Fecha_Despliegue_Real) {
    var actualizado = {};
    Object.keys(existente).forEach(function (k) {
      if (k !== '_fila') actualizado[k] = existente[k];
    });
    actualizado.Estado_Release = 'En Produccion';
    actualizado.Fecha_Despliegue_Real = new Date();
    escribirFila_('Roadmap_Versiones', existente._fila, actualizado);
  }
}

/* ================================================================== */
/* 7. Auditoria                                                        */
/* ================================================================== */

/**
 * Inserta una fila inmutable en Auditoria_Transiciones.
 *  Horas_En_Fase        = horas calendario desde el ultimo cambio.
 *  Dias_Habiles_En_Fase = dias habiles desde el ultimo cambio, que es la
 *                         medida contra la que se evalua el SLA de la fase.
 *
 * @param {!Object} datos { idSolicitud, faseOrigen, faseDestino, estadoOrigen,
 *                          estadoDestino, desde, correoUsuario }
 * @return {string} ID de auditoria generado.
 */
function registrarTransicionAudit(datos) {
  var ahora = new Date();
  var desde = datos.desde ? aFecha_(datos.desde) : null;
  var horas = desde ? (ahora.getTime() - desde.getTime()) / 3600000 : 0;

  var id = 'AUD-' + ahora.getTime();
  agregarFila_('Auditoria_Transiciones', {
    ID_Auditoria: id,
    ID_Solicitud: datos.idSolicitud,
    Fase_Origen: datos.faseOrigen || '',
    Fase_Destino: datos.faseDestino || '',
    Estado_Origen: datos.estadoOrigen || '',
    Estado_Destino: datos.estadoDestino || '',
    Fecha_Hora_Cambio: ahora,
    Usuario_Responsable: datos.correoUsuario || '',
    Horas_En_Fase: Math.round(horas * 10) / 10,
    Dias_Habiles_En_Fase: desde ? diasHabilesEntre(desde, ahora) : 0
  });
  return id;
}

/* ================================================================== */
/* 8. Drive: carpeta y documento por solicitud                         */
/* ================================================================== */

/**
 * Crea la carpeta dedicada de la solicitud dentro de la Unidad Compartida y
 * clona alli la plantilla del formato de requerimiento.
 *
 * Nomenclatura: ID_Solicitud_YYYYMMDD_[Plataforma]_NombreLimpio
 *
 * @param {string} idSolicitud
 * @param {string} idPlataforma
 * @param {string} nombreSolicitud
 * @return {{carpetaUrl: string, docUrl: string}}
 * @private
 */
function crearContenedorDrive_(idSolicitud, idPlataforma, nombreSolicitud) {
  var raiz = DriveApp.getFolderById(CONFIG.DRIVE_UNIDAD_RAIZ_ID);
  var hoy = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyyMMdd');
  var plataforma = mapaPlataformas()[idPlataforma] || idPlataforma || 'Sin plataforma';

  var nombreCarpeta = idSolicitud + '_' + hoy + '_[' + plataforma + ']_' +
                      limpiarNombre_(nombreSolicitud);
  var carpeta = raiz.createFolder(nombreCarpeta);

  var docUrl = '';
  var idPlantilla = getProp(PROP_KEYS.PLANTILLA_REQUERIMIENTO, false);
  if (idPlantilla) {
    var copia = DriveApp.getFileById(idPlantilla)
        .makeCopy('Requerimiento_' + idSolicitud, carpeta);
    docUrl = copia.getUrl();
  }
  return { carpetaUrl: carpeta.getUrl(), docUrl: docUrl };
}

/**
 * Normaliza un texto para el nombre de carpeta: sin tildes, sin caracteres
 * especiales y con guiones bajos en lugar de espacios.
 * @param {string} texto
 * @return {string}
 */
function limpiarNombre_(texto) {
  return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 80);
}

/* ================================================================== */
/* 9. Notificaciones                                                   */
/* ================================================================== */

/**
 * Envia las notificaciones de un evento. Nunca interrumpe la operacion: si
 * Chat o Gmail fallan, devuelve el aviso y la solicitud queda guardada igual.
 *
 * @param {!Object} solicitud
 * @param {string} evento 'creacion' | 'cambio_fase' | 'bloqueo'
 * @return {!Array<string>} Avisos para mostrar al usuario.
 * @private
 */
function notificar_(solicitud, evento) {
  var avisos = [];
  if (CONFIG.NOTIFICAR_CHAT && getChatWebhookUrl()) {
    try { notificarChat_(solicitud, evento); }
    catch (e) { avisos.push('No se pudo publicar en Google Chat: ' + e.message); }
  }
  if (CONFIG.NOTIFICAR_CORREO) {
    try { notificarCorreo_(solicitud, evento); }
    catch (e) { avisos.push('No se pudo enviar el correo: ' + e.message); }
  }
  return avisos;
}

/**
 * Publica una tarjeta en el espacio de Google Chat.
 * @private
 */
function notificarChat_(solicitud, evento) {
  var titulos = {
    creacion: 'Nueva solicitud registrada',
    cambio_fase: 'Cambio de fase',
    bloqueo: 'Solicitud bloqueada'
  };
  var plataforma = mapaPlataformas()[solicitud.Plataforma_ID] || '';
  var fase = mapaFases()[solicitud.Fase_Actual] || solicitud.Fase_Actual;
  var estado = mapaEstados()[solicitud.Estado_Actual] || solicitud.Estado_Actual;

  var proyecto = solicitud.ID_Proyecto ? buscarPorPk_('Proyectos', solicitud.ID_Proyecto) : null;
  var iniciativa = proyecto ? proyecto.Nombre_Proyecto : (solicitud.ID_Proyecto || 'Sin iniciativa');
  var registro = aFecha_(solicitud.Fecha_Registro);
  var registroTexto = registro
      ? Utilities.formatDate(registro, CONFIG.ZONA_HORARIA, CONFIG.FORMATO_FECHA_HORA)
      : 'sin fecha';

  var campos = [
    { decoratedText: { topLabel: 'Solicitud',
                       text: solicitud.Nombre_Solicitud + ' (' + solicitud.ID_Solicitud + ')',
                       wrapText: true } },
    { decoratedText: { topLabel: 'Iniciativa', text: iniciativa, wrapText: true } },
    { decoratedText: { topLabel: 'Registrada', text: registroTexto } },
    { decoratedText: { topLabel: 'Fase / Estado', text: fase + ' · ' + estado } }
  ];
  if (String(solicitud.Tiene_Bloqueo).toUpperCase().indexOf('S') === 0) {
    var causal = solicitud.Causal_Bloqueo;
    CAUSALES_BLOQUEO.forEach(function (c) { if (c.id === causal) causal = c.nombre; });
    campos.push({ decoratedText: { topLabel: 'Causal del bloqueo', text: causal } });
    if (solicitud.Observacion_Bloqueo) {
      campos.push({ decoratedText: { topLabel: 'Observacion',
                                     text: String(solicitud.Observacion_Bloqueo),
                                     wrapText: true } });
    }
  }

  var botones = [];
  if (solicitud.Carpeta_Drive_URL) {
    botones.push({ text: 'Carpeta en Drive',
                   onClick: { openLink: { url: solicitud.Carpeta_Drive_URL } } });
  }
  if (solicitud.Doc_Requerimiento_URL) {
    botones.push({ text: 'Requerimiento',
                   onClick: { openLink: { url: solicitud.Doc_Requerimiento_URL } } });
  }
  if (botones.length) campos.push({ buttonList: { buttons: botones } });

  var payload = {
    cardsV2: [{
      cardId: solicitud.ID_Solicitud + '-' + evento,
      card: {
        header: { title: titulos[evento] || 'Actualizacion',
                  subtitle: iniciativa + (plataforma ? ' · ' + plataforma : '') },
        sections: [{ widgets: campos }]
      }
    }]
  };

  UrlFetchApp.fetch(getChatWebhookUrl(), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/**
 * Envia el correo al solicitante y al responsable.
 * @private
 */
function notificarCorreo_(solicitud, evento) {
  var destinatarios = [];
  [solicitud.Solicitante_ID, solicitud.Responsable_ID].forEach(function (idUsuario) {
    if (!idUsuario) return;
    var u = buscarPorPk_('Usuarios', idUsuario);
    if (u && u.Correo_ID && destinatarios.indexOf(u.Correo_ID) === -1) {
      destinatarios.push(u.Correo_ID);
    }
  });
  if (!destinatarios.length) return;   // nadie tiene correo corporativo todavia

  var asuntos = {
    creacion: 'Solicitud registrada',
    cambio_fase: 'Avance de solicitud',
    bloqueo: 'Solicitud bloqueada'
  };
  // El asunto lleva el nombre de la solicitud: quien recibe varios correos al
  // dia distingue de cual se trata sin abrirlos.
  var asunto = (asuntos[evento] || 'Actualizacion') + ': ' +
               solicitud.Nombre_Solicitud + ' (' + solicitud.ID_Solicitud + ')';

  MailApp.sendEmail({
    to: destinatarios.join(','),
    subject: asunto,
    htmlBody: cuerpoCorreo_(solicitud, evento)
  });
}

/**
 * Arma el HTML del correo con la identidad corporativa.
 * @private
 */
function cuerpoCorreo_(solicitud, evento) {
  var fase = mapaFases()[solicitud.Fase_Actual] || solicitud.Fase_Actual;
  var estado = mapaEstados()[solicitud.Estado_Actual] || solicitud.Estado_Actual;
  var plataforma = mapaPlataformas()[solicitud.Plataforma_ID] || '';
  var mensajes = {
    creacion: 'Su solicitud quedo registrada en el sistema.',
    cambio_fase: 'La solicitud avanzo de fase.',
    bloqueo: 'La solicitud fue marcada con un bloqueo.'
  };

  var datos = [
    ['Solicitud', solicitud.ID_Solicitud],
    ['Nombre', solicitud.Nombre_Solicitud],
    ['Plataforma', plataforma],
    ['Fase actual', fase],
    ['Estado', estado]
  ];
  if (String(solicitud.Tiene_Bloqueo).toUpperCase().indexOf('S') === 0) {
    var causal = solicitud.Causal_Bloqueo;
    CAUSALES_BLOQUEO.forEach(function (c) { if (c.id === causal) causal = c.nombre; });
    datos.push(['Causal del bloqueo', causal]);
    if (solicitud.Observacion_Bloqueo) {
      datos.push(['Observacion', String(solicitud.Observacion_Bloqueo)]);
    }
  }

  var filas = datos.map(function (f) {
    return '<tr><td style="padding:6px 12px;color:#5A6B8C;font-size:13px">' + f[0] +
           '</td><td style="padding:6px 12px;font-size:13px"><b>' + f[1] + '</b></td></tr>';
  }).join('');

  var botones = '';
  if (solicitud.Carpeta_Drive_URL) {
    botones += '<a href="' + solicitud.Carpeta_Drive_URL + '" style="background:#1DD982;' +
               'color:#00306E;text-decoration:none;font-weight:bold;padding:10px 16px;' +
               'border-radius:8px;display:inline-block;margin-right:8px">Carpeta en Drive</a>';
  }
  if (solicitud.Doc_Requerimiento_URL) {
    botones += '<a href="' + solicitud.Doc_Requerimiento_URL + '" style="background:#FFFFFF;' +
               'color:#00306E;border:1px solid #DFE6F2;text-decoration:none;padding:10px 16px;' +
               'border-radius:8px;display:inline-block">Documento de requerimiento</a>';
  }

  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;' +
         'border:1px solid #EDF1F8;border-radius:12px;overflow:hidden">' +
         '<div style="background:#00306E;color:#fff;padding:16px 20px">' +
         '<div style="font-size:16px;font-weight:bold">' + CONFIG.APP_NOMBRE + '</div>' +
         '<div style="font-size:12px;color:#AFC3E4">' + CONFIG.APP_SUBTITULO + '</div></div>' +
         '<div style="padding:20px">' +
         '<p style="font-size:14px;color:#0D1F3C">' + (mensajes[evento] || '') + '</p>' +
         '<table style="width:100%;border-collapse:collapse">' + filas + '</table>' +
         '<div style="margin-top:18px">' + botones + '</div></div></div>';
}

/* ================================================================== */
/* 10. CRUD de parametrizacion (pagina Admin)                          */
/* ================================================================== */

/**
 * Devuelve la definicion de una tabla maestra y sus filas.
 * @param {string} tabla
 * @return {!Object}
 */
function adminCargarTabla(tabla) {
  exigirAdministrador_();
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  return {
    tabla: tabla,
    etiqueta: info.def.etiqueta,
    pk: info.def.pk,
    columnas: info.def.columnas,
    opciones: opcionesDeReferencia_(info.def.columnas),
    filas: leerTabla(tabla)
  };
}

/**
 * Arma las listas desplegables de las columnas que referencian otra tabla.
 * @private
 */
function opcionesDeReferencia_(columnas) {
  var catalogos = {
    Roles: ROLES, Fases: FASES, Estados: ESTADOS, Estados_Iniciativa: ESTADOS_INICIATIVA,
    Tipos_Solicitud: TIPOS_SOLICITUD, Tipos_Iniciativa: TIPOS_INICIATIVA,
    Prioridad: PRIORIDADES, Causales_Bloqueo: CAUSALES_BLOQUEO,
    Plataforma_Digital: PLATAFORMAS, Lineas_Estrategicas: LINEAS_ESTRATEGICAS,
    Verticales: VERTICALES
  };
  var opciones = {};
  columnas.forEach(function (col) {
    if (!col.fk) return;
    if (catalogos[col.fk]) {
      opciones[col.campo] = catalogos[col.fk].map(function (x) {
        return { valor: x.id, texto: x.nombre };
      });
      return;
    }
    var info = getDefinicionTabla(col.fk);
    if (!info) return;
    var pk = info.def.pk;
    var etiqueta = info.def.columnas[1] ? info.def.columnas[1].campo : pk;
    opciones[col.campo] = leerTabla(col.fk).map(function (f) {
      return { valor: f[pk], texto: f[etiqueta] || f[pk] };
    });
  });
  return opciones;
}

/**
 * Crea un registro en una tabla maestra.
 * @param {string} tabla
 * @param {!Object} registro
 * @return {!Object}
 */
function adminCrearRegistro(tabla, registro) {
  exigirAdministrador_();
  return conBloqueo_(function () {
    var info = getDefinicionTabla(tabla);
    if (!registro[info.def.pk]) {
      registro[info.def.pk] = siguienteId_(tabla, info.def.pk);
    }
    normalizarFechas_(tabla, registro);
    validarRegistro_(tabla, registro, true);
    agregarFila_(tabla, registro);
    return { ok: true, pk: registro[info.def.pk] };
  });
}

/**
 * Actualiza un registro existente conservando su llave primaria.
 * @param {string} tabla
 * @param {string} valorPk
 * @param {!Object} registro
 * @return {!Object}
 */
function adminActualizarRegistro(tabla, valorPk, registro) {
  exigirAdministrador_();
  return conBloqueo_(function () {
    var info = getDefinicionTabla(tabla);
    var actual = buscarPorPk_(tabla, valorPk);
    if (!actual) throw new Error('No existe el registro ' + valorPk + '.');

    registro[info.def.pk] = valorPk;          // la llave nunca cambia
    normalizarFechas_(tabla, registro);
    validarRegistro_(tabla, registro, false);
    escribirFila_(tabla, actual._fila, registro);
    return { ok: true, pk: valorPk };
  });
}

/**
 * Elimina fisicamente una fila de una tabla maestra.
 * @param {string} tabla
 * @param {string} valorPk
 * @return {!Object}
 */
function adminEliminarRegistro(tabla, valorPk) {
  exigirAdministrador_();
  return conBloqueo_(function () {
    var info = getDefinicionTabla(tabla);
    if (info.def.inmutable) {
      throw new Error('La tabla ' + tabla + ' es inmutable: no admite borrado.');
    }
    var actual = buscarPorPk_(tabla, valorPk);
    if (!actual) throw new Error('No existe el registro ' + valorPk + '.');

    var usos = referenciasA_(tabla, valorPk);
    if (usos.length) {
      throw new Error('No se puede eliminar: el registro esta en uso en ' + usos.join(', ') + '.');
    }
    getHoja_(tabla).deleteRow(actual._fila);
    invalidarTabla_(tabla);
    return { ok: true, pk: valorPk };
  });
}

/**
 * Busca si otras tablas apuntan a este registro, para no romper la
 * integridad referencial al borrar.
 * @private
 */
function referenciasA_(tabla, valorPk) {
  var usos = [];
  [ESQUEMA_PARAMETRIZACION, ESQUEMA_TRANSACCIONAL].forEach(function (esquema) {
    Object.keys(esquema).forEach(function (otra) {
      esquema[otra].columnas.forEach(function (col) {
        if (col.fk !== tabla) return;
        var enUso = leerTabla(otra).some(function (fila) {
          return String(fila[col.campo]) === String(valorPk);
        });
        if (enUso && usos.indexOf(esquema[otra].etiqueta) === -1) {
          usos.push(esquema[otra].etiqueta);
        }
      });
    });
  });
  return usos;
}

/**
 * Genera el siguiente identificador de una tabla, con su mismo prefijo.
 * @private
 */
function siguienteId_(tabla, pk) {
  var prefijos = { Usuarios: 'USR', Proyectos: 'INI', Plataforma_Digital: 'PL' };
  var prefijo = prefijos[tabla] || tabla.substring(0, 3).toUpperCase();
  var maximo = 0;
  leerTabla(tabla).forEach(function (f) {
    var m = String(f[pk] || '').match(/(\d+)$/);
    if (m) maximo = Math.max(maximo, Number(m[1]));
  });
  return prefijo + '-' + ('00' + (maximo + 1)).slice(-3);
}

/** @private */
function exigirAdministrador_() {
  var ctx = exigirSesion_();
  if (!ctx.esAdmin) throw new Error('Acceso denegado: se requiere rol Administrador.');
  return ctx;
}
