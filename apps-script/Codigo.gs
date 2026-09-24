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
 * Identifica a quien esta usando la aplicacion y resuelve su rol.
 *
 * Si el despachador ya resolvio la identidad para esta ejecucion, la reutiliza.
 * Si no —por ejemplo cuando la funcion se ejecuta a mano desde el editor—,
 * pregunta a Google.
 *
 * @return {!Object}
 */
function getContextoUsuario() {
  if (SESION_ACTUAL) return SESION_ACTUAL;
  var correo = correoDeGoogle_();
  if (!correo) {
    return { autorizado: false, requiereIngreso: true,
             motivo: 'Identifiquese para entrar.' };
  }
  return contextoDeCorreo_(correo, 'google');
}

/**
 * Correo que Google nos deja ver, o '' si no nos deja.
 *
 * Desde que la aplicacion corre a nombre de su dueno, Google solo revela la
 * identidad de quien pertenece al mismo dominio. Para los demas devuelve vacio,
 * y de ahi el ingreso por codigo.
 *
 * @return {string}
 * @private
 */
function correoDeGoogle_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

/**
 * Busca a una persona por su correo en la hoja de Usuarios.
 * @param {string} correo Ya normalizado a minusculas.
 * @return {?Object}
 * @private
 */
function usuarioPorCorreo_(correo) {
  var usuarios = leerTabla_('Usuarios');
  for (var i = 0; i < usuarios.length; i++) {
    var registrado = String(usuarios[i].Correo_ID || '').trim().toLowerCase();
    if (registrado && registrado === correo) return usuarios[i];
  }
  return null;
}

/**
 * Arma el contexto de trabajo a partir de un correo YA COMPROBADO.
 *
 * Quien llama a esta funcion ya establecio que el correo es de quien dice ser
 * —porque lo dijo Google, o porque la persona escribio el codigo que llego a
 * ese buzon—. Aqui solo se resuelve si existe, si esta activo y que puede
 * hacer.
 *
 * El filtro por dominio dejo de ser uno solo y paso a ser una lista: la
 * aplicacion admite a proposito gente de fuera (la fabrica de software), pero
 * no de cualquier parte. Quien decide quien entra sigue siendo la hoja de
 * Usuarios; el dominio es una comprobacion adicional.
 *
 * @param {string} correo
 * @param {string} via 'google' o 'codigo'. Queda en el contexto para saber por
 *     donde entro cada quien.
 * @return {!Object}
 * @private
 */
function contextoDeCorreo_(correo, via) {
  // Segunda cerradura: aunque el correo este en la hoja, tiene que ser de un
  // dominio admitido. Cubre el caso de un correo registrado por error —uno
  // personal, por ejemplo— y hace la regla explicita para quien la audite.
  if (!dominioAdmitido_(correo)) {
    return { autorizado: false, correo: correo, requiereIngreso: true,
             motivo: 'Su correo no pertenece a un dominio autorizado para esta ' +
                     'aplicacion. Hable con el administrador.' };
  }

  var usuario = usuarioPorCorreo_(correo);
  if (!usuario) {
    return { autorizado: false, correo: correo, requiereIngreso: true,
             motivo: 'Su correo no esta asociado a ningun usuario del sistema. ' +
                     'Solicite al administrador que lo registre.' };
  }
  if (String(usuario.Activo).toUpperCase() === 'NO') {
    return { autorizado: false, correo: correo, requiereIngreso: true,
             motivo: 'Usuario inactivo.' };
  }

  var permisos = getPermisos(usuario.Rol_ID);
  return {
    autorizado: true,
    via: via,
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
 * Devuelve el contexto de quien esta operando, o falla.
 *
 * Es la guardia que usan todas las operaciones de negocio. Desde que existe el
 * despachador, la identidad ya viene resuelta en SESION_ACTUAL; esta funcion
 * sigue siendo el punto unico donde se comprueba, y el que falla si no hay.
 *
 * @return {!Object}
 * @private
 */
function exigirSesion_() {
  var ctx = getContextoUsuario();
  if (!ctx.autorizado) throw new Error(ctx.motivo || 'Sesion no autorizada.');
  return ctx;
}

/**
 * Exige que quien ejecuta sea el dueno de la aplicacion —desde el editor o
 * desde un disparador— o un administrador identificado.
 *
 * Las funciones de instalacion, mantenimiento y diagnostico no se usan desde la
 * pantalla: se ejecutan a mano desde el editor de Apps Script. Pero al estar
 * declaradas como funciones sueltas, google.script.run podria invocarlas desde
 * el navegador de cualquiera, y ahora la aplicacion esta abierta a internet.
 * Esta guardia es lo que impide que un desconocido borre la memoria, renumere
 * las solicitudes o lea la configuracion.
 *
 * @return {!Object}
 * @private
 */
function exigirOperador_() {
  var correo = correoDeGoogle_();
  var dueno = '';
  try {
    dueno = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (e) { /* sin permiso para saberlo */ }

  if (correo && dueno && correo === dueno) return { correo: correo, esDueno: true };
  return exigirAdministrador_();
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
      ? getIdLibroParametrizacion_()
      : getIdLibroTransaccional_();
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
function leerTabla_(tabla) {
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
  var filas = leerTabla_(tabla);
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
  // Se actualiza esa fila en la memoria compartida en vez de botar la tabla:
  // botarla obligaba a releer la hoja entera en la siguiente consulta.
  refrescarFilaEnCache_(tabla, numeroFila, columnas);
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
    proyectos: leerTabla_('Proyectos'),
    plataformas: PLATAFORMAS,
    usuarios: leerTabla_('Usuarios'),
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
  limpiarCache_();
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
  // La version viaja tambien cuando el acceso se niega: el pie de pagina es
  // justo lo que hay que mirar para saber que version esta viendo quien
  // reporta un problema.
  if (!contexto.autorizado) return { contexto: contexto, version: getVersionApp_() };
  return {
    contexto: contexto,
    version: getVersionApp_(),
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
  // El tablero se abre siempre sin filtros (el filtrado ocurre en el
  // navegador), asi que ese caso —el unico que se repite— vale la pena
  // cachearlo ya armado. Una consulta con filtros es de un solo uso.
  var sinFiltros = !filtros || Object.keys(filtros).length === 0;
  if (sinFiltros) {
    return conResultadoEnCache_('kanban', function () { return armarDatosKanban_({}); });
  }
  return armarDatosKanban_(filtros);
}

/**
 * Arma el tablero de verdad.
 * @param {!Object} filtros
 * @return {!Object}
 * @private
 */
function armarDatosKanban_(filtros) {
  var proyectos = leerTabla_('Proyectos');
  var usuarios = leerTabla_('Usuarios');
  var nombrePlataforma = mapaPlataformas();
  var nombreProyecto = {}, nombreUsuario = {};
  proyectos.forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  usuarios.forEach(function (u) { nombreUsuario[u.ID_Usuario] = u.Nombre_Completo; });

  var solicitudes = getSolicitudes_(filtros).map(function (s) {
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
    versiones: getVersionesDisponibles_()
  };
}

/**
 * Lista las solicitudes aplicando filtros opcionales.
 * @param {!Object=} filtros { idProyecto, plataforma, responsable, texto }
 * @return {!Array<!Object>}
 */
function getSolicitudes_(filtros) {
  var f = filtros || {};
  return leerTabla_('Solicitudes').filter(function (s) {
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
  leerTabla_('Proyectos').forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  leerTabla_('Usuarios').forEach(function (u) { nombreUsuario[u.ID_Usuario] = u.Nombre_Completo; });

  s.Nombre_Iniciativa = nombreProyecto[s.ID_Proyecto] || s.ID_Proyecto;
  s.Nombre_Responsable = nombreUsuario[s.Responsable_ID] || '';
  s.Nombre_Solicitante = nombreUsuario[s.Solicitante_ID] || '';
  s.Nombre_Plataforma = mapaPlataformas()[s.Plataforma_ID] || s.Plataforma_ID;
  s.Historial = leerTabla_('Auditoria_Transiciones')
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
  var disponibles = getVersionesDisponibles_(idPlataforma);
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
function getVersionesDisponibles_(idPlataforma) {
  var nombrePlataforma = mapaPlataformas();
  var vistas = {};
  var lista = [];

  leerTabla_('Roadmap_Versiones').forEach(function (v) {
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
 * Genera el ID de la siguiente solicitud: SOL-0015.
 *
 * El ID es el prefijo y el consecutivo, nada mas. Antes llevaba tambien la
 * fecha (SOL-20260923-015) y eso lo hacia largo de leer y de dictar, sin
 * aportar: la fecha de registro ya vive en su propia columna, donde ademas se
 * puede corregir; la del ID quedaba congelada y podia terminar contradiciendola.
 *
 * El consecutivo continua la serie de toda la hoja y nunca se reinicia, de modo
 * que el numero identifica la solicitud por si solo.
 *
 * @return {string}
 * @private
 */
function generarIdSolicitud_() {
  var maximo = 0;
  leerTabla_('Solicitudes').forEach(function (s) {
    maximo = Math.max(maximo, consecutivoDeId_(s.ID_Solicitud));
  });
  return formatearIdSolicitud_(maximo + 1);
}

/**
 * Numero consecutivo que lleva un ID de solicitud, en cualquiera de los dos
 * formatos: SOL-0015 y el antiguo SOL-20260923-015 devuelven 15.
 *
 * @param {*} id
 * @return {number} 0 si el ID no trae un consecutivo reconocible.
 * @private
 */
function consecutivoDeId_(id) {
  var partes = String(id || '').trim().split('-');
  var ultimo = partes[partes.length - 1].trim();
  // Se aceptan hasta seis digitos: asi un ID trunco como "SOL-20260923" no se
  // confunde con un numero de serie y dispara el contador a veinte millones.
  return /^\d{1,6}$/.test(ultimo) ? Number(ultimo) : 0;
}

/**
 * Arma el ID a partir del consecutivo, con relleno de ceros a la izquierda.
 * @param {number} numero
 * @return {string}
 * @private
 */
function formatearIdSolicitud_(numero) {
  var n = String(Math.max(1, Math.floor(Number(numero) || 1)));
  var ancho = CONFIG.DIGITOS_SOLICITUD;
  var relleno = n.length >= ancho ? n : (new Array(ancho + 1).join('0') + n).slice(-ancho);
  return CONFIG.PREFIJO_SOLICITUD + '-' + relleno;
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
  leerTabla_('Solicitudes').forEach(function (s) {
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

    registrarTransicionAudit_({
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
  opciones.Version_Semantica = getVersionesDisponibles_(s.Plataforma_ID);

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
      registrarTransicionAudit_({
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

    registrarTransicionAudit_({
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
    registrarTransicionAudit_({
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
  leerTabla_('Roadmap_Versiones').forEach(function (v) {
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
function registrarTransicionAudit_(datos) {
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
  var idPlantilla = getProp_(PROP_KEYS.PLANTILLA_REQUERIMIENTO, false);
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
  if (CONFIG.NOTIFICAR_CHAT && getChatWebhookUrl_()) {
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

  UrlFetchApp.fetch(getChatWebhookUrl_(), {
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
         '<div style="font-size:16px;font-weight:bold">' + CONFIG.APP_NOMBRE + '</div></div>' +
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
    filas: leerTabla_(tabla)
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
    opciones[col.campo] = leerTabla_(col.fk).map(function (f) {
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
        var enUso = leerTabla_(otra).some(function (fila) {
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
  leerTabla_(tabla).forEach(function (f) {
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

/* ================================================================== */
/* 12. Correo de bienvenida                                            */
/* ================================================================== */

/**
 * Envia a una persona el correo que la invita a empezar a usar la herramienta.
 *
 * Dar de alta a alguien en la hoja de Usuarios no le avisa nada: queda
 * habilitado y no se entera. Este correo cierra ese hueco, y de paso le dice
 * las tres cosas que nadie mas le va a decir: para que sirve la herramienta,
 * como se entra, y que su rol ya lo espera.
 *
 * Quien lo envia recibe copia, para tener constancia de a quien se invito y
 * cuando, sin depender de la memoria de nadie.
 *
 * @param {string} idUsuario
 * @return {!Object} { ok, destinatario, copia, nombre }
 */
function enviarCorreoBienvenida(idUsuario) {
  var ctx = exigirAdministrador_();

  var u = buscarPorPk_('Usuarios', idUsuario);
  if (!u) throw new Error('No existe el usuario ' + idUsuario + '.');
  if (!u.Correo_ID) {
    throw new Error('A ' + (u.Nombre_Completo || idUsuario) + ' le falta el correo ' +
                    'corporativo. Registrelo primero en la ficha del usuario.');
  }

  var url = getUrlAplicacion_();
  if (!url) {
    throw new Error('No hay una direccion de acceso configurada. Ejecute ' +
                    'configurarUrlAplicacion("https://...") desde el editor de Apps Script ' +
                    'con la direccion que reparte al equipo.');
  }

  var rol = mapaCatalogo_(ROLES)[u.Rol_ID] || '';
  // Sin genero: el correo va a personas cuyo genero el sistema no conoce ni
  // tiene por que suponer a partir del nombre.
  var asunto = 'Le damos la bienvenida a ' + CONFIG.APP_NOMBRE;

  MailApp.sendEmail({
    to: u.Correo_ID,
    cc: ctx.correo,
    subject: asunto,
    htmlBody: cuerpoBienvenida_(u, rol, url, ctx)
  });

  return {
    ok: true,
    nombre: u.Nombre_Completo || idUsuario,
    destinatario: u.Correo_ID,
    copia: ctx.correo
  };
}

/**
 * Cuerpo del correo de bienvenida.
 * @private
 */
function cuerpoBienvenida_(usuario, rol, url, ctx) {
  var nombreCorto = String(usuario.Nombre_Completo || '').split(' ')[0] || '';

  // El texto del correo lleva sus tildes como entidades HTML: el resto de los
  // archivos .gs es ASCII puro, y asi el mensaje se lee bien escrito sin que el
  // codigo dependa de como viaje la codificacion hasta Apps Script.
  var pasos = [
    'Abra el enlace de abajo desde su cuenta corporativa.',
    'La primera vez, Google le pedir&aacute; autorizar la aplicaci&oacute;n: es normal y ' +
    'ocurre una sola vez.',
    'Entrar&aacute; directo, con su nombre y su rol ya configurados. No hay usuario ni ' +
    'contrase&ntilde;a aparte.'
  ].map(function (t, i) {
    return '<tr><td style="padding:3px 10px 3px 0;color:#1BB26C;font-weight:bold;' +
           'font-size:13px;vertical-align:top">' + (i + 1) + '.</td>' +
           '<td style="padding:3px 0;font-size:13.5px;color:#0D1F3C">' + t + '</td></tr>';
  }).join('');

  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;' +
    'border:1px solid #EDF1F8;border-radius:12px;overflow:hidden">' +

    '<div style="background:#00306E;color:#fff;padding:20px">' +
    '<div style="font-size:18px;font-weight:bold">' + CONFIG.APP_NOMBRE + '</div></div>' +

    '<div style="padding:22px">' +

    '<p style="font-size:15px;color:#0D1F3C;margin:0 0 14px">' +
    (nombreCorto ? 'Hola, ' + escapeHtml_(nombreCorto) + ':' : 'Hola:') + '</p>' +

    '<p style="font-size:13.5px;color:#0D1F3C;line-height:1.55;margin:0 0 14px">' +
    'Ya tiene acceso a <b>' + CONFIG.APP_NOMBRE + '</b>, el lugar donde la Gerencia de ' +
    'Desarrollo de Plataformas Digitales gestionar&aacute; de aqu&iacute; en adelante sus ' +
    'iniciativas, solicitudes y entregas.</p>' +

    '<p style="font-size:13.5px;color:#0D1F3C;line-height:1.55;margin:0 0 14px">' +
    'La idea es simple: que todo lo que hoy vive repartido entre correos, archivos y ' +
    'conversaciones quede en un solo tablero, con su fase, su responsable y su fecha a la ' +
    'vista. As&iacute; se sabe en qu&eacute; va cada cosa sin tener que preguntar, y los ' +
    'indicadores de la f&aacute;brica salen solos de lo que el equipo registra a diario.</p>' +

    (rol ? '<p style="font-size:13.5px;color:#0D1F3C;margin:0 0 6px">' +
           'Su perfil es <b>' + escapeHtml_(rol) + '</b>, y define qu&eacute; puede ver y ' +
           'mover dentro del flujo.</p>' : '') +

    '<div style="background:#F3F6FB;border-radius:8px;padding:14px 16px;margin:16px 0">' +
    '<div style="font-size:12px;font-weight:bold;color:#00306E;text-transform:uppercase;' +
    'letter-spacing:.06em;margin-bottom:8px">C&oacute;mo ingresar</div>' +
    '<table style="border-collapse:collapse">' + pasos + '</table></div>' +

    '<div style="text-align:center;margin:22px 0 18px">' +
    '<a href="' + escapeHtml_(url) + '" style="background:#1DD982;color:#00306E;' +
    'text-decoration:none;font-weight:bold;font-size:14px;padding:13px 26px;' +
    'border-radius:8px;display:inline-block">Entrar a la plataforma</a></div>' +

    '<p style="font-size:13.5px;color:#0D1F3C;line-height:1.55;margin:0 0 14px">' +
    'Nos alegra contar con usted. Entre, mire el tablero y empecemos a gestionar.</p>' +

    '<p style="font-size:12px;color:#5A6B8C;margin:18px 0 0;border-top:1px solid #EDF1F8;' +
    'padding-top:12px">Cualquier duda, responda este correo: le llega a ' +
    escapeHtml_(ctx.correo) + '.</p>' +

    '</div></div>';
}

/**
 * Escapa texto para insertarlo en HTML. El correo lleva nombres y direcciones
 * que vienen de la hoja, y una comilla suelta bastaria para romper el marcado.
 * @private
 */
function escapeHtml_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ================================================================== */
/* 13. Puerta unica: el despachador                                    */
/* ================================================================== */

/**
 * Operaciones que el navegador puede pedir, y solo esas.
 *
 * La lista es explicita a proposito. Despachar con this[metodo] dejaria al
 * alcance de cualquiera TODAS las funciones del proyecto, incluidas las de
 * instalacion, mantenimiento y reparacion. Lo que no este nombrado aqui no se
 * puede invocar desde afuera.
 */
var METODOS_PUBLICOS = {
  getArranque: true,
  getCatalogos: true,
  getMetricasHome: true,
  getMatrizIniciativas: true,
  getDatosKanban: true,
  getDetalleSolicitud: true,
  getFormularioSolicitud: true,
  getRoadmapVersiones: true,
  getReportes: true,
  crearSolicitud: true,
  actualizarSolicitudCompleta: true,
  cambiarFaseSolicitud: true,
  marcarBloqueo: true,
  refrescarDatos: true,
  adminCargarTabla: true,
  adminCrearRegistro: true,
  adminActualizarRegistro: true,
  adminEliminarRegistro: true,
  enviarCorreoBienvenida: true,
  getFormularioMigracion: true,
  migrarSolicitud: true
};

/**
 * Unica puerta de entrada desde el navegador.
 *
 * Antes cada operacion era una funcion suelta que google.script.run podia
 * llamar directamente, y cada una preguntaba por su cuenta quien era el
 * usuario. Ahora la identidad se establece UNA vez, aqui, y queda fija para el
 * resto de la ejecucion: ninguna operacion puede olvidarse de comprobarla,
 * porque ya no tiene como llegar sin pasar por este punto.
 *
 * @param {string} token Identificador de sesion, o '' si entra por Google.
 * @param {string} metodo Nombre de la operacion.
 * @param {!Array} args Argumentos de la operacion.
 * @return {*}
 */
function llamar(token, metodo, args) {
  if (!METODOS_PUBLICOS[metodo]) {
    throw new Error('Operacion no reconocida: ' + metodo);
  }

  SESION_ACTUAL = null;
  var ctx = resolverIdentidad_(token);
  if (!ctx.autorizado) {
    // El prefijo lo reconoce el navegador para volver a pedir el ingreso en
    // lugar de mostrar un error suelto.
    throw new Error('SESION_INVALIDA: ' + (ctx.motivo || 'Identifiquese para entrar.'));
  }
  SESION_ACTUAL = ctx;

  // Se resuelve en el ambito global y no con this: cuando la funcion llega por
  // google.script.run, this no es de fiar, y de ahi saldria un error confuso
  // en vez de la operacion pedida.
  var fn = globalThis[metodo];
  if (typeof fn !== 'function') {
    throw new Error('La operacion ' + metodo + ' no esta disponible.');
  }

  try {
    return fn.apply(null, args || []);
  } finally {
    SESION_ACTUAL = null;
  }
}

/**
 * Resuelve quien esta del otro lado: primero Google, y si Google no lo sabe,
 * la sesion abierta con codigo.
 * @private
 */
function resolverIdentidad_(token) {
  var correoGoogle = correoDeGoogle_();
  if (correoGoogle) return contextoDeCorreo_(correoGoogle, 'google');

  var correoSesion = correoDeSesion_(token);
  if (correoSesion) return contextoDeCorreo_(correoSesion, 'codigo');

  return { autorizado: false, requiereIngreso: true,
           motivo: 'Identifiquese para entrar.' };
}

