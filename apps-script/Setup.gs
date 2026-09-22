/**
 * Setup.gs
 * Instalador del sistema. Se ejecuta UNA vez desde el editor de Apps Script
 * (o de nuevo, sin riesgo: es idempotente) y deja el entorno listo:
 *
 *   1. Crea o reutiliza los dos libros de Google Sheets.
 *   2. Crea todas las hojas con sus encabezados y formato corporativo.
 *   3. Siembra los catalogos maestros (fases, estados, tipos, prioridad,
 *      causales, plataformas, roles y SLA por fase).
 *   4. Crea la plantilla de requerimiento en la Unidad Compartida si no existe.
 *   5. Guarda todos los IDs en PropertiesService.
 *
 * Los datos de negocio (Usuarios, Proyectos, Aplicaciones) NO se siembran:
 * se cargan desde la pagina de Administracion o directamente en la hoja.
 */

/**
 * Punto de entrada del instalador.
 * @return {!Object} Resumen con las URLs de los artefactos creados.
 */
function setupInicial() {
  var resumen = { creado: [], reutilizado: [] };

  var libroParam = abrirOCrearLibro_(
    PROP_KEYS.LIBRO_PARAMETRIZACION, CONFIG.NOMBRE_LIBRO_PARAMETRIZACION, resumen);
  var libroTrans = abrirOCrearLibro_(
    PROP_KEYS.LIBRO_TRANSACCIONAL, CONFIG.NOMBRE_LIBRO_TRANSACCIONAL, resumen);

  crearHojas_(libroParam, ESQUEMA_PARAMETRIZACION);
  crearHojas_(libroTrans, ESQUEMA_TRANSACCIONAL);
  sembrarCatalogos_(libroParam);
  asegurarPlantillaRequerimiento_(resumen);

  resumen.libroParametrizacionUrl = libroParam.getUrl();
  resumen.libroTransaccionalUrl = libroTrans.getUrl();
  resumen.pendientes = pendientesDeConfiguracion_();

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

/**
 * Abre el libro cuyo ID esta en PropertiesService; si no existe, lo crea,
 * lo mueve a la Unidad Compartida raiz y guarda su ID.
 * @param {string} propKey
 * @param {string} nombre
 * @param {!Object} resumen
 * @return {!Spreadsheet}
 * @private
 */
function abrirOCrearLibro_(propKey, nombre, resumen) {
  var id = getProp(propKey, false);
  if (id) {
    try {
      var existente = SpreadsheetApp.openById(id);
      resumen.reutilizado.push(nombre + ' (' + id + ')');
      return existente;
    } catch (e) {
      Logger.log('No se pudo abrir ' + nombre + ' con ID ' + id + ': ' + e.message +
                 '. Se creara uno nuevo.');
    }
  }
  var libro = SpreadsheetApp.create(nombre);
  libro.setSpreadsheetTimeZone(CONFIG.ZONA_HORARIA);
  moverAUnidadCompartida_(libro.getId());
  guardarConfiguracion(defineProp_(propKey, libro.getId()));
  resumen.creado.push(nombre + ' (' + libro.getId() + ')');
  return libro;
}

/**
 * Mueve un archivo a la Unidad Compartida raiz configurada.
 * No es critico: si falla (permisos), el archivo queda en Mi unidad.
 * @param {string} fileId
 * @private
 */
function moverAUnidadCompartida_(fileId) {
  try {
    var destino = DriveApp.getFolderById(CONFIG.DRIVE_UNIDAD_RAIZ_ID);
    DriveApp.getFileById(fileId).moveTo(destino);
  } catch (e) {
    Logger.log('Aviso: no se pudo mover ' + fileId + ' a la Unidad Compartida: ' + e.message);
  }
}

/**
 * Crea las hojas faltantes y normaliza encabezados y formato.
 * Nunca borra hojas ni datos existentes.
 * @param {!Spreadsheet} libro
 * @param {!Object} esquema
 * @private
 */
function crearHojas_(libro, esquema) {
  Object.keys(esquema).forEach(function (nombreHoja) {
    var def = esquema[nombreHoja];
    var hoja = libro.getSheetByName(nombreHoja) || libro.insertSheet(nombreHoja);
    var encabezados = def.columnas.map(function (c) { return c.campo; });

    // Una hoja nueva trae 26 columnas; Solicitudes necesita mas.
    if (hoja.getMaxColumns() < encabezados.length) {
      hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
    }

    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.getRange(1, 1, 1, encabezados.length)
        .setFontWeight('bold')
        .setFontColor(CONFIG.COLORES.BLANCO)
        .setBackground(CONFIG.COLORES.NAVY);
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, encabezados.length);
  });

  // Elimina la hoja por defecto que Google crea con cada libro nuevo.
  var vacia = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (vacia && libro.getSheets().length > 1) libro.deleteSheet(vacia);
}

/**
 * Carga los catalogos maestros si sus hojas estan vacias.
 * @param {!Spreadsheet} libro Libro de parametrizacion.
 * @private
 */
function sembrarCatalogos_(libro) {
  sembrarSiVacio_(libro, 'Fases', FASES.map(function (f) {
    return [f.id, f.nombre, f.orden];
  }));

  sembrarSiVacio_(libro, 'Estados', ESTADOS.map(function (e) {
    return [e.id, e.nombre];
  }));

  sembrarSiVacio_(libro, 'Plataforma_Digital', PLATAFORMAS.map(function (p) {
    return [p.id, p.nombre];
  }));

  sembrarSiVacio_(libro, 'Tipos_Solicitud', TIPOS_SOLICITUD.map(function (t) {
    return [t.id, t.nombre];
  }));

  sembrarSiVacio_(libro, 'Prioridad', PRIORIDADES.map(function (p) {
    return [p.id, p.nombre];
  }));

  sembrarSiVacio_(libro, 'Causales_Bloqueo', CAUSALES_BLOQUEO.map(function (c) {
    return [c.id, c.nombre];
  }));

  sembrarSiVacio_(libro, 'Roles', ROLES.map(function (r) {
    var permisos = getPermisos(r.id);
    return [
      r.id,
      r.nombre,
      permisos.fases === TODAS ? 'TODAS' : permisos.fases.join(', '),
      permisos.override ? 'Control total' : (permisos.campos === TODAS ? 'Edicion completa' : 'Edicion parcial')
    ];
  }));

  sembrarSiVacio_(libro, 'Lineas_Estrategicas', LINEAS_ESTRATEGICAS.map(function (l) {
    return [l.id, l.nombre, l.orden];
  }));

  sembrarSiVacio_(libro, 'Verticales', VERTICALES.map(function (v) {
    return [v.id, v.nombre, v.orden];
  }));

  // SLA por fase: valores iniciales sugeridos, ajustables desde Administracion.
  var slaSugerido = { 'FAS-01': 5, 'FAS-02': 10, 'FAS-03': 10, 'FAS-04': 15,
                      'FAS-05': 5, 'FAS-06': 5, 'FAS-07': 3, 'FAS-08': 1 };
  sembrarSiVacio_(libro, 'SLA_Fases', FASES.map(function (f) {
    return [f.id, f.nombre, slaSugerido[f.id]];
  }));
}

/**
 * Escribe filas en una hoja solo si aun no tiene datos (fila 2 en adelante).
 * @param {!Spreadsheet} libro
 * @param {string} nombreHoja
 * @param {!Array<!Array<*>>} filas
 * @private
 */
function sembrarSiVacio_(libro, nombreHoja, filas) {
  var hoja = libro.getSheetByName(nombreHoja);
  if (!hoja) throw new Error('Hoja no encontrada al sembrar: ' + nombreHoja);
  if (hoja.getLastRow() > 1) return;
  if (!filas.length) return;
  hoja.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
}

/**
 * Verifica que exista la plantilla de requerimiento; si no, crea un Google Doc
 * base con la estructura minima del formato oficial.
 * @param {!Object} resumen
 * @private
 */
function asegurarPlantillaRequerimiento_(resumen) {
  var id = getProp(PROP_KEYS.PLANTILLA_REQUERIMIENTO, false);
  if (id) {
    try {
      DriveApp.getFileById(id);
      resumen.reutilizado.push(CONFIG.NOMBRE_PLANTILLA_REQUERIMIENTO + ' (' + id + ')');
      return;
    } catch (e) {
      Logger.log('Plantilla ' + id + ' inaccesible: ' + e.message + '. Se creara una nueva.');
    }
  }

  var doc = DocumentApp.create(CONFIG.NOMBRE_PLANTILLA_REQUERIMIENTO);
  var cuerpo = doc.getBody();
  cuerpo.appendParagraph('FORMATO DE REQUERIMIENTO')
        .setHeading(DocumentApp.ParagraphHeading.TITLE);
  ['1. Identificacion de la solicitud',
   '2. Objetivo de negocio',
   '3. Alcance y entregable',
   '4. Proceso impactado',
   '5. Criterios de aceptacion',
   '6. Analisis tecnico y arquitectura',
   '7. Plan de pruebas (QA / UAT)',
   '8. Plan de despliegue y rollback'].forEach(function (titulo) {
    cuerpo.appendParagraph(titulo).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    cuerpo.appendParagraph('');
  });
  doc.saveAndClose();

  moverAUnidadCompartida_(doc.getId());
  guardarConfiguracion(defineProp_(PROP_KEYS.PLANTILLA_REQUERIMIENTO, doc.getId()));
  resumen.creado.push(CONFIG.NOMBRE_PLANTILLA_REQUERIMIENTO + ' (' + doc.getId() + ')');
}

/**
 * @return {!Array<string>} Lista de configuraciones que siguen pendientes.
 * @private
 */
function pendientesDeConfiguracion_() {
  var pendientes = [];
  if (!getChatWebhookUrl()) {
    pendientes.push('Webhook de Google Chat: registrar con guardarConfiguracion().');
  }
  if (!getDominioCorporativo()) {
    pendientes.push('Dominio corporativo: sin restriccion de dominio activa.');
  }
  return pendientes;
}

/**
 * Helper para construir un objeto de una sola clave dinamica.
 * @param {string} clave
 * @param {string} valor
 * @return {!Object<string,string>}
 * @private
 */
function defineProp_(clave, valor) {
  var o = {};
  o[clave] = valor;
  return o;
}

/**
 * Verificacion post-instalacion: confirma que cada hoja existe y que sus
 * encabezados coinciden exactamente con el esquema declarado.
 * @return {!Object} Reporte de hojas OK y hojas con diferencias.
 */
function validarInstalacion() {
  var reporte = { ok: [], problemas: [] };

  [[getIdLibroParametrizacion(), ESQUEMA_PARAMETRIZACION],
   [getIdLibroTransaccional(), ESQUEMA_TRANSACCIONAL]].forEach(function (par) {
    var libro = SpreadsheetApp.openById(par[0]);
    var esquema = par[1];
    Object.keys(esquema).forEach(function (nombreHoja) {
      var hoja = libro.getSheetByName(nombreHoja);
      if (!hoja) {
        reporte.problemas.push('Falta la hoja: ' + nombreHoja);
        return;
      }
      var esperados = esquema[nombreHoja].columnas.map(function (c) { return c.campo; });
      if (hoja.getMaxColumns() < esperados.length) {
        reporte.problemas.push('La hoja ' + nombreHoja + ' tiene menos columnas de las ' +
                               'requeridas (' + esperados.length + '). Ejecute setupInicial().');
        return;
      }
      var actuales = hoja.getRange(1, 1, 1, esperados.length).getValues()[0];
      if (esperados.join('|') !== actuales.join('|')) {
        reporte.problemas.push('Encabezados distintos en ' + nombreHoja +
                               '. Esperado: ' + esperados.join(', '));
      } else {
        reporte.ok.push(nombreHoja);
      }
    });
  });

  reporte.configuracion = diagnosticoConfiguracion();
  Logger.log(JSON.stringify(reporte, null, 2));
  return reporte;
}
