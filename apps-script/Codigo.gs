/**
 * Codigo.gs
 * Backend serverless: punto de entrada de la Web App, capa de acceso a datos
 * sobre Google Sheets y API expuesta al frontend via google.script.run.
 *
 * ESTADO: esqueleto. Las lecturas y utilidades estan implementadas; los flujos
 * de escritura, Drive, Chat y metricas estan declarados con su contrato final y
 * marcados con TODO(fase-2) para implementarse en la siguiente entrega.
 */

/* ================================================================== */
/* 1. Entrada de la Web App                                            */
/* ================================================================== */

/**
 * Sirve la SPA.
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
 * Receptor de webhooks entrantes (integraciones externas, ej. Taiga).
 * @param {!Object} e
 * @return {!TextOutput}
 */
function doPost(e) {
  // TODO(fase-2): enrutar por e.parameter.accion y validar firma del emisor.
  return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'No implementado' }))
      .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Permite componer los HTML parciales desde Index.html.
 * @param {string} archivo Nombre del archivo sin extension.
 * @return {string}
 */
function include(archivo) {
  return HtmlService.createHtmlOutputFromFile(archivo).getContent();
}

/* ================================================================== */
/* 2. Sesion y contexto del usuario                                    */
/* ================================================================== */

/**
 * Identifica al usuario autenticado por SSO, resuelve su rol y devuelve el
 * contexto que el frontend usa para habilitar u ocultar acciones.
 * @return {!Object} { correo, nombre, cargo, area, rolId, rolNombre,
 *                     esAdmin, fasesEditables, autorizado }
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

  var usuarios = leerTabla('Usuarios');
  var usuario = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].Correo_ID).toLowerCase() === correo) {
      usuario = usuarios[i];
      break;
    }
  }
  if (!usuario) {
    return { autorizado: false, correo: correo,
             motivo: 'El usuario no esta registrado en la tabla Usuarios.' };
  }
  if (String(usuario.Activo).toUpperCase() === 'NO') {
    return { autorizado: false, correo: correo, motivo: 'Usuario inactivo.' };
  }

  var permisos = getPermisos(usuario.Rol_ID);
  return {
    autorizado: true,
    correo: correo,
    nombre: usuario.Nombre_Completo,
    cargo: usuario.Cargo,
    area: usuario.Area,
    rolId: usuario.Rol_ID,
    rolNombre: nombreDeRol_(usuario.Rol_ID),
    esAdmin: esAdministrador(usuario.Rol_ID),
    fasesEditables: permisos.fases === TODAS
        ? FASES.map(function (f) { return f.id; })
        : permisos.fases
  };
}

/**
 * @param {string} rolId
 * @return {string}
 * @private
 */
function nombreDeRol_(rolId) {
  for (var i = 0; i < ROLES.length; i++) {
    if (ROLES[i].id === rolId) return ROLES[i].nombre;
  }
  return rolId;
}

/* ================================================================== */
/* 3. Capa de acceso a datos (Google Sheets)                           */
/* ================================================================== */

/**
 * Abre el libro correspondiente a una tabla.
 * @param {string} tabla
 * @return {!Sheet}
 * @private
 */
function getHoja_(tabla) {
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  var id = info.libro === 'PARAMETRIZACION'
      ? getIdLibroParametrizacion()
      : getIdLibroTransaccional();
  var hoja = SpreadsheetApp.openById(id).getSheetByName(tabla);
  if (!hoja) throw new Error('La hoja "' + tabla + '" no existe. Ejecute setupInicial().');
  return hoja;
}

/**
 * Lee una tabla completa como arreglo de objetos, usando la fila 1 como llaves.
 * @param {string} tabla
 * @return {!Array<!Object>}
 */
function leerTabla(tabla) {
  var hoja = getHoja_(tabla);
  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 2) return [];

  var valores = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  var encabezados = valores[0];
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var obj = {};
    for (var j = 0; j < encabezados.length; j++) {
      if (!encabezados[j]) continue;
      obj[encabezados[j]] = normalizarValor_(valores[i][j]);
    }
    obj._fila = i + 1; // numero real de fila en la hoja, para editar/eliminar
    filas.push(obj);
  }
  return filas;
}

/**
 * Convierte fechas a ISO para que viajen correctamente a google.script.run.
 * @param {*} valor
 * @return {*}
 * @private
 */
function normalizarValor_(valor) {
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

/**
 * Devuelve todos los catalogos maestros en una sola llamada (evita N round-trips
 * desde el frontend al construir filtros y formularios).
 * @return {!Object}
 */
function getCatalogos() {
  return {
    proyectos: leerTabla('Proyectos'),
    aplicaciones: leerTabla('Aplicaciones'),
    plataformas: leerTabla('Plataforma_Digital'),
    usuarios: leerTabla('Usuarios'),
    fases: FASES,
    estados: ESTADOS,
    tipos: TIPOS_SOLICITUD,
    prioridades: PRIORIDADES,
    causales: CAUSALES_BLOQUEO,
    roles: ROLES
  };
}

/* ================================================================== */
/* 4. API de Solicitudes                                               */
/* ================================================================== */

/**
 * Genera el consecutivo SOL-YYYYMMDD-XXX del dia.
 * @return {string}
 * @private
 */
function generarIdSolicitud_() {
  var hoy = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyyMMdd');
  var prefijo = CONFIG.PREFIJO_SOLICITUD + '-' + hoy + '-';
  var existentes = leerTabla('Solicitudes').filter(function (s) {
    return String(s.ID_Solicitud).indexOf(prefijo) === 0;
  });
  var consecutivo = existentes.length + 1;
  return prefijo + ('00' + consecutivo).slice(-3);
}

/**
 * Lista las solicitudes para el tablero Kanban, con filtros opcionales.
 * @param {!Object=} filtros { idProyecto, plataforma, responsable, texto }
 * @return {!Array<!Object>}
 */
function getSolicitudes(filtros) {
  var f = filtros || {};
  return leerTabla('Solicitudes').filter(function (s) {
    if (f.idProyecto && s.ID_Proyecto !== f.idProyecto) return false;
    if (f.plataforma && s.Plataforma !== f.plataforma) return false;
    if (f.responsable && s.Responsable_Actual !== f.responsable) return false;
    if (f.texto) {
      var aguja = String(f.texto).toLowerCase();
      var pajar = (String(s.ID_Solicitud) + ' ' + String(s.Nombre_Solicitud)).toLowerCase();
      if (pajar.indexOf(aguja) === -1) return false;
    }
    return true;
  });
}

/**
 * Registra una nueva solicitud: valida, asigna ID, crea la carpeta en Drive,
 * clona la plantilla, escribe la fila y notifica por Chat y correo.
 * @param {!Object} datos Campos del formulario de registro.
 * @return {!Object} { ok, idSolicitud, carpetaUrl, docUrl }
 */
function crearSolicitud(datos) {
  // TODO(fase-2): validar contra ESQUEMA_TRANSACCIONAL.Solicitudes,
  // generarIdSolicitud_(), crearContenedorDrive_(), escribir fila con
  // Fase_Actual='FAS-01', Estado_Actual='EST-01', Tiene_Bloqueo='NO',
  // registrarTransicionAudit() y notificar.
  throw new Error('crearSolicitud: pendiente de implementacion (fase 2).');
}

/**
 * Actualiza campos de una solicitud respetando el RBAC por campo.
 * @param {string} idSolicitud
 * @param {!Object} cambios Mapa campo -> valor nuevo.
 * @return {!Object}
 */
function actualizarSolicitud(idSolicitud, cambios) {
  // TODO(fase-2): verificar puedeEditarCampo() por cada clave de "cambios".
  throw new Error('actualizarSolicitud: pendiente de implementacion (fase 2).');
}

/**
 * Mueve una solicitud de fase (drag & drop del Kanban).
 * Valida la transicion con validarTransicion(), sella las estampas de tiempo de
 * la fase destino y registra la auditoria inmutable.
 * @param {string} idSolicitud
 * @param {string} faseDestino
 * @param {string=} estadoDestino
 * @return {!Object}
 */
function cambiarFaseSolicitud(idSolicitud, faseDestino, estadoDestino) {
  // TODO(fase-2): implementar con LockService para evitar escrituras concurrentes.
  throw new Error('cambiarFaseSolicitud: pendiente de implementacion (fase 2).');
}

/**
 * Activa o desactiva el bloqueo de una solicitud.
 * @param {string} idSolicitud
 * @param {boolean} bloqueada
 * @param {string=} idCausal Obligatorio cuando bloqueada es true.
 * @return {!Object}
 */
function marcarBloqueo(idSolicitud, bloqueada, idCausal) {
  // TODO(fase-2): Causal_Bloqueo obligatorio si bloqueada === true.
  throw new Error('marcarBloqueo: pendiente de implementacion (fase 2).');
}

/* ================================================================== */
/* 5. Auditoria y metricas                                             */
/* ================================================================== */

/**
 * Inserta una fila inmutable en Auditoria_Transiciones.
 * Horas_En_Fase = (ahora - Fecha_Ultimo_Cambio) / 3.600.000 ms.
 * @param {!Object} solicitud Fila actual (antes del cambio).
 * @param {string} faseDestino
 * @param {string} estadoDestino
 * @param {string} correoUsuario
 * @return {string} ID_Auditoria generado.
 */
function registrarTransicionAudit(solicitud, faseDestino, estadoDestino, correoUsuario) {
  // TODO(fase-2): append a Auditoria_Transiciones con ID AUD-<timestamp>.
  throw new Error('registrarTransicionAudit: pendiente de implementacion (fase 2).');
}

/**
 * Metricas del dashboard gerencial (Home).
 * @return {!Object} { iniciativasTotales, solicitudesEnVuelo,
 *                     timeToMarketPromedioDias, bloqueosActivos,
 *                     distribucionPlataforma, cumplimientoSla }
 */
function getMetricasHome() {
  // TODO(fase-2): Lead Time = Fecha_Despliegue - Fecha_Registro sobre las
  // solicitudes en FAS-08; SLA comparando Horas_En_Fase contra SLA_Fases.
  throw new Error('getMetricasHome: pendiente de implementacion (fase 2).');
}

/**
 * Datos de la pagina de Reportes: Lead Time, Cycle Time por fase y bitacora.
 * @param {!Object=} filtros
 * @return {!Object}
 */
function getReportes(filtros) {
  // TODO(fase-2).
  throw new Error('getReportes: pendiente de implementacion (fase 2).');
}

/* ================================================================== */
/* 6. Drive, Chat y correo                                             */
/* ================================================================== */

/**
 * Crea la carpeta dedicada de la solicitud y clona la plantilla dentro.
 * Nomenclatura: ID_Solicitud_YYYYMMDD_[Plataforma]_NombreLimpio
 * @param {string} idSolicitud
 * @param {string} plataforma
 * @param {string} nombreSolicitud
 * @return {{carpetaUrl: string, docUrl: string}}
 */
function crearContenedorDrive_(idSolicitud, plataforma, nombreSolicitud) {
  // TODO(fase-2): DriveApp.getFolderById(CONFIG.DRIVE_UNIDAD_RAIZ_ID)
  //               .createFolder(nombre) + makeCopy de la plantilla.
  throw new Error('crearContenedorDrive_: pendiente de implementacion (fase 2).');
}

/**
 * Normaliza un texto para usarlo en el nombre de carpeta: sin tildes, sin
 * caracteres especiales y con guiones bajos en lugar de espacios.
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

/**
 * Publica una tarjeta interactiva en el espacio de Google Chat.
 * @param {!Object} solicitud
 * @param {string} evento 'creacion' | 'cambio_fase' | 'bloqueo'
 */
function notificarChat_(solicitud, evento) {
  // TODO(fase-2): UrlFetchApp.fetch(getChatWebhookUrl(), {cardsV2}).
  throw new Error('notificarChat_: pendiente de implementacion (fase 2).');
}

/**
 * Envia el correo HTML al solicitante o al nuevo responsable.
 * @param {string} destinatario
 * @param {!Object} solicitud
 * @param {string} evento
 */
function notificarCorreo_(destinatario, solicitud, evento) {
  // TODO(fase-2): MailApp.sendEmail con plantilla HTML corporativa.
  throw new Error('notificarCorreo_: pendiente de implementacion (fase 2).');
}

/* ================================================================== */
/* 7. CRUD de parametrizacion (pagina Admin)                           */
/* ================================================================== */

/**
 * Devuelve la definicion de una tabla maestra y sus filas, para construir la
 * grilla y el formulario modal dinamico.
 * @param {string} tabla
 * @return {!Object} { columnas, filas }
 */
function adminCargarTabla(tabla) {
  exigirAdministrador_();
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  return { columnas: info.def.columnas, pk: info.def.pk, filas: leerTabla(tabla) };
}

/**
 * Crea un registro en una tabla maestra.
 * @param {string} tabla
 * @param {!Object} registro
 * @return {!Object}
 */
function adminCrearRegistro(tabla, registro) {
  exigirAdministrador_();
  // TODO(fase-2): validar unicidad de la PK y tipos antes de appendRow.
  throw new Error('adminCrearRegistro: pendiente de implementacion (fase 2).');
}

/**
 * Actualiza un registro existente conservando su PK.
 * @param {string} tabla
 * @param {string} valorPk
 * @param {!Object} registro
 * @return {!Object}
 */
function adminActualizarRegistro(tabla, valorPk, registro) {
  exigirAdministrador_();
  // TODO(fase-2).
  throw new Error('adminActualizarRegistro: pendiente de implementacion (fase 2).');
}

/**
 * Elimina fisicamente una fila de una tabla maestra.
 * @param {string} tabla
 * @param {string} valorPk
 * @return {!Object}
 */
function adminEliminarRegistro(tabla, valorPk) {
  exigirAdministrador_();
  // TODO(fase-2).
  throw new Error('adminEliminarRegistro: pendiente de implementacion (fase 2).');
}

/**
 * Corta la ejecucion si el usuario en sesion no es Administrador.
 * @private
 */
function exigirAdministrador_() {
  var ctx = getContextoUsuario();
  if (!ctx.autorizado || !ctx.esAdmin) {
    throw new Error('Acceso denegado: se requiere rol Administrador.');
  }
}
