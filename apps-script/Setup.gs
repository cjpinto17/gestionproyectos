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
 * Los datos de negocio (Usuarios, Iniciativas) no se siembran aqui: los carga
 * cargarDatosIniciales() en DatosIniciales.gs, o se capturan desde la pagina
 * de Administracion.
 */

/**
 * Punto de entrada del instalador.
 * @return {!Object} Resumen con las URLs de los artefactos creados.
 */
function setupInicial() {
  exigirOperador_();
  var resumen = { creado: [], reutilizado: [] };

  var libroParam = abrirOCrearLibro_(
    PROP_KEYS.LIBRO_PARAMETRIZACION, CONFIG.NOMBRE_LIBRO_PARAMETRIZACION, resumen);
  var libroTrans = abrirOCrearLibro_(
    PROP_KEYS.LIBRO_TRANSACCIONAL, CONFIG.NOMBRE_LIBRO_TRANSACCIONAL, resumen);

  crearHojas_(libroParam, ESQUEMA_PARAMETRIZACION);
  crearHojas_(libroTrans, ESQUEMA_TRANSACCIONAL);
  sembrarCatalogos_(libroParam);

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
  var id = getProp_(propKey, false);
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
  guardarConfiguracion_(defineProp_(propKey, libro.getId()));
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
    var existia = libro.getSheetByName(nombreHoja);
    var hoja = existia || libro.insertSheet(nombreHoja);
    var encabezados = def.columnas.map(function (c) { return c.campo; });

    // Una hoja nueva trae 26 columnas; Solicitudes necesita mas.
    if (hoja.getMaxColumns() < encabezados.length) {
      hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
    }

    // Una hoja QUE YA TENIA DATOS no se le reescriben los encabezados por
    // posicion. El esquema cambia con el tiempo —se retiro Fecha_Estimada y se
    // agrego Fecha_Fin_Real (D-60)— y escribir la lista nueva sobre la vieja
    // le pondria a cada columna el nombre de la siguiente: las fechas de inicio
    // quedarian rotuladas como fecha fin y nadie se daria cuenta. Para esas
    // hojas se agregan solo las columnas que falten, en su posicion, que es lo
    // que hace asegurarColumnas_ sin mover un solo dato.
    if (existia && hoja.getLastRow() > 1) {
      alinearEncabezados_(hoja, encabezados);
    } else {
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    }

    hoja.getRange(1, 1, 1, hoja.getLastColumn() || encabezados.length)
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
 * Pone las hojas al dia con el esquema, sin tocar un solo dato.
 *
 * Es lo que hay que ejecutar cuando una version nueva agrega una tabla o una
 * columna: crea las hojas que falten, agrega las columnas que falten en su
 * posicion, y reporta que hizo. No renombra, no reordena, no borra y no
 * siembra nada; una columna que el esquema ya no declara se deja quieta con su
 * contenido, para que el dato historico no se pierda por un cambio de modelo.
 *
 * Se puede ejecutar cuantas veces se quiera: la segunda vez no hace nada.
 *
 * @return {!Object} Que hojas y que columnas se agregaron.
 */
function actualizarEstructura() {
  exigirOperador_();
  var resumen = { hojasCreadas: [], columnasAgregadas: [], sinCambios: [] };

  [[getIdLibroParametrizacion_(), ESQUEMA_PARAMETRIZACION],
   [getIdLibroTransaccional_(), ESQUEMA_TRANSACCIONAL]].forEach(function (par) {
    var libro = SpreadsheetApp.openById(par[0]);
    Object.keys(par[1]).forEach(function (nombreHoja) {
      var encabezados = par[1][nombreHoja].columnas.map(function (c) { return c.campo; });
      var hoja = libro.getSheetByName(nombreHoja);

      if (!hoja) {
        hoja = libro.insertSheet(nombreHoja);
        if (hoja.getMaxColumns() < encabezados.length) {
          hoja.insertColumnsAfter(hoja.getMaxColumns(),
                                  encabezados.length - hoja.getMaxColumns());
        }
        hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
        hoja.getRange(1, 1, 1, encabezados.length)
            .setFontWeight('bold')
            .setFontColor(CONFIG.COLORES.BLANCO)
            .setBackground(CONFIG.COLORES.NAVY);
        hoja.setFrozenRows(1);
        hoja.autoResizeColumns(1, encabezados.length);
        resumen.hojasCreadas.push(nombreHoja);
        return;
      }

      var antes = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0]
          .map(function (v) { return String(v || ''); });
      var faltantes = encabezados.filter(function (c) { return antes.indexOf(c) === -1; });
      if (!faltantes.length) { resumen.sinCambios.push(nombreHoja); return; }

      alinearEncabezados_(hoja, encabezados);
      faltantes.forEach(function (c) {
        resumen.columnasAgregadas.push(nombreHoja + '.' + c);
      });
    });
  });

  resumen.filasAgregadas = completarCatalogos_(
      SpreadsheetApp.openById(getIdLibroParametrizacion_()));

  // Una hoja recien creada queda vacia, y hay tablas que SIN datos no sirven de
  // nada: Costos_Fabrica sin tarifas deja la pagina de Costos sin con que
  // calcular. completarCatalogos_ no las cubre porque no son listas de id y
  // nombre. Se siembran aqui, y solo si siguen vacias, para no pisar lo que
  // alguien haya editado a mano.
  resumen.filasSembradas = sembrarTablasConValoresDeFabrica_(
      SpreadsheetApp.openById(getIdLibroParametrizacion_()));

  if (resumen.filasAgregadas.length || resumen.filasSembradas.length) limpiarCache_();

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

/**
 * Agrega a los catalogos las filas que el codigo declara y la hoja no tiene.
 *
 * Hace falta porque sembrarCatalogos_() solo siembra una hoja VACIA: una vez
 * sembrada, un catalogo nuevo escrito en el codigo no llegaba nunca a la hoja, y
 * como los desplegables se arman con lo que dice la hoja, el dato existia en el
 * codigo y no existia en la aplicacion. Es lo que habria pasado con el tipo
 * "Estabilizacion" (D-101): declarado, invisible y sin forma de escogerlo.
 *
 * Compara por identificador y solo AGREGA. No renombra lo que ya esta —si
 * alguien tradujo un nombre desde Administracion, su nombre manda— y no borra
 * nada. La contrapartida, que conviene saber: una fila de catalogo que alguien
 * borro a proposito vuelve a aparecer la proxima vez que esto corra, porque
 * desde aqui no hay forma de distinguir "lo borre" de "nunca llego". Se reporta
 * cada fila que se agrega para que se vea.
 *
 * @param {!Spreadsheet} libro Libro de parametrizacion.
 * @return {!Array<string>} Las filas agregadas, como 'Hoja.ID'.
 * @private
 */
function completarCatalogos_(libro) {
  var agregadas = [];

  Object.keys(CATALOGOS_AMPLIABLES).forEach(function (nombreHoja) {
    var hoja = libro.getSheetByName(nombreHoja);
    if (!hoja || hoja.getLastRow() < 1) return;

    var def = ESQUEMA_PARAMETRIZACION[nombreHoja];
    if (!def) return;
    var encabezados = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0]
        .map(function (v) { return String(v || ''); });
    var campos = def.columnas.map(function (c) { return c.campo; });
    var colPk = encabezados.indexOf(def.pk);
    if (colPk === -1) return;                 // la hoja aun no tiene su columna clave

    var existentes = {};
    if (hoja.getLastRow() > 1) {
      hoja.getRange(2, colPk + 1, hoja.getLastRow() - 1, 1).getValues()
          .forEach(function (f) { existentes[String(f[0]).trim()] = true; });
    }

    var delCodigo = CATALOGOS_AMPLIABLES[nombreHoja]();
    var nuevas = delCodigo.filter(function (x) { return !existentes[String(x.id)]; });
    if (!nuevas.length) return;

    // Se escribe en el orden REAL de la hoja, no en el del esquema: si a la hoja
    // le faltan columnas o las tiene movidas, escribir por posicion del esquema
    // correria los valores de lugar.
    var filas = nuevas.map(function (x) {
      return encabezados.map(function (campo) {
        var i = campos.indexOf(campo);
        if (campo === def.pk) return x.id;
        if (i === 1) return x.nombre;                 // la segunda columna es el nombre
        if (i === 2 && /^Orden_/.test(campo)) return x.orden || '';
        return '';
      });
    });
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, encabezados.length).setValues(filas);
    nuevas.forEach(function (x) { agregadas.push(nombreHoja + '.' + x.id); });
  });

  return agregadas;
}

/**
 * Agrega a una hoja con datos las columnas que el esquema declara y ella no
 * tiene, cada una en su posicion. No renombra, no reordena y no borra: una
 * columna que sobra —resto de una version anterior del modelo— se deja quieta
 * con su contenido.
 *
 * @param {!Sheet} hoja
 * @param {!Array<string>} encabezados Los que el esquema declara, en orden.
 * @private
 */
function alinearEncabezados_(hoja, encabezados) {
  var ancho = Math.max(hoja.getLastColumn(), 1);
  var actuales = hoja.getRange(1, 1, 1, ancho).getValues()[0]
      .map(function (v) { return String(v || ''); });

  encabezados.forEach(function (campo, i) {
    if (actuales.indexOf(campo) !== -1) return;
    var posicion = Math.min(i + 1, actuales.length + 1);
    if (posicion <= hoja.getMaxColumns()) {
      hoja.insertColumnBefore(posicion);
    } else {
      hoja.insertColumnsAfter(hoja.getMaxColumns(), 1);
    }
    hoja.getRange(1, posicion).setValue(campo);
    // Una columna recien insertada hereda el formato y las REGLAS de su vecina.
    // Asi nacio el defecto de D-107: una columna de numeros al lado de una de
    // SI/NO quedaba con la regla de SI/NO, y despues la aplicacion no podia
    // escribir en ella. Se limpia al nacer.
    hoja.getRange(1, posicion, hoja.getMaxRows(), 1).clearDataValidations();
    actuales.splice(posicion - 1, 0, campo);
  });
}

/**
 * Siembra las tablas que traen valores de fabrica y que estan vacias.
 *
 * sembrarCatalogos_ solo corre en setupInicial(), asi que una tabla agregada
 * despues nacia vacia para siempre. Paso con Costos_Fabrica: la hoja se creo, la
 * pagina de Costos no tenia tarifas y desde afuera parecia que no hacia nada.
 *
 * @param {!Spreadsheet} libro Libro de parametrizacion.
 * @return {!Array<string>} Las hojas que se sembraron.
 * @private
 */
function sembrarTablasConValoresDeFabrica_(libro) {
  var sembradas = [];
  var conSemilla = { Costos_Fabrica: TARIFAS_DE_FABRICA };

  Object.keys(conSemilla).forEach(function (nombreHoja) {
    var hoja = libro.getSheetByName(nombreHoja);
    if (!hoja || hoja.getLastRow() > 1) return;     // no existe, o ya tiene datos
    sembrarSiVacio_(libro, nombreHoja, conSemilla[nombreHoja]);
    sembradas.push(nombreHoja + ' (' + conSemilla[nombreHoja].length + ' filas)');
  });

  return sembradas;
}

/**
 * Las bolsas de costo con que arranca la fabrica (D-110).
 *
 * Vive aqui arriba y no dentro de sembrarCatalogos_ porque la hoja tambien se
 * crea desde actualizarEstructura, y la primera vez quedo creada y VACIA: la
 * pagina de Costos no tenia con que calcular y no habia como saber por que.
 *
 * Las dos dedicadas salen por resta de la capacidad base: el "Desarrollador
 * Junior - Devops" ya estaba dentro de los 111 millones de desarrollo, y los dos
 * "Analista de Pruebas Middle - Automatizacion" dentro de los 43,7 de pruebas.
 * Cobrarlas aparte sin restarlas habria contado esa gente dos veces.
 */
var TARIFAS_DE_FABRICA = [
    ['CF-ANA', 'ETA-ANA', 'Capacidad base de análisis y diseño',
     51297629, '2026-09-01', '2026-12-31', ''],
    ['CF-DEV', 'ETA-DEV', 'Capacidad base de desarrollo (sin el dev dedicado a Devops)',
     105914086, '2026-09-01', '2026-12-31', ''],
    ['CF-DEV-DEVOPS', 'ETA-DEV', 'Desarrollador Junior dedicado a Devops',
     5179412, '2026-09-01', '2026-12-31', 'INI-018'],
    ['CF-DEV-SETI', 'ETA-DEV', 'Capacidad extendida SETI · Devops',
     14530000, '2026-07-01', '2026-12-31', 'INI-018'],
    ['CF-QA', 'ETA-QA', 'Capacidad base de pruebas QA y UAT (sin los QA de automatización)',
     34633651, '2026-09-01', '2026-12-31', ''],
    ['CF-QA-AUTO', 'ETA-QA', '2 Analistas de Pruebas Middle dedicados a Automatización',
     9115764, '2026-09-01', '2026-12-31', 'INI-019'],
    ['CF-QA-SETI', 'ETA-QA', 'Capacidad extendida SETI · Automatización de pruebas',
     15200000, '2026-09-01', '2026-11-30', 'INI-019']
  ];

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

  sembrarSiVacio_(libro, 'Estados_Iniciativa', ESTADOS_INICIATIVA.map(function (e) {
    return [e.id, e.nombre];
  }));

  sembrarSiVacio_(libro, 'Plataforma_Digital', PLATAFORMAS.map(function (p) {
    return [p.id, p.nombre];
  }));

  sembrarSiVacio_(libro, 'Tipos_Solicitud', TIPOS_SOLICITUD.map(function (t) {
    return [t.id, t.nombre];
  }));

  sembrarSiVacio_(libro, 'Tipos_Iniciativa', TIPOS_INICIATIVA.map(function (t) {
    return [t.id, t.nombre];
  }));

  sembrarSiVacio_(libro, 'Prioridad', PRIORIDADES.map(function (p) {
    return [p.id, p.nombre];
  }));

  sembrarSiVacio_(libro, 'Costos_Fabrica', TARIFAS_DE_FABRICA);


  sembrarSiVacio_(libro, 'Analistas', ANALISTAS.map(function (a) {
    return [a.id, a.nombre];
  }));

  sembrarSiVacio_(libro, 'Causas_Raiz', CAUSAS_RAIZ.map(function (c) {
    return [c.id, c.nombre];
  }));

  sembrarSiVacio_(libro, 'Fabricas', FABRICAS.map(function (f) {
    // Solo ID y nombre: el NIT y el contrato son datos administrativos que el
    // negocio llena cuando los tenga, y sembrarlos vacios no estorba.
    return [f.id, f.nombre, '', ''];
  }));
  sembrarSiVacio_(libro, 'Causales_Bloqueo', CAUSALES_BLOQUEO.map(function (c) {
    return [c.id, c.nombre];
  }));

  sembrarSiVacio_(libro, 'Lineas_Estrategicas', LINEAS_ESTRATEGICAS.map(function (l) {
    return [l.id, l.nombre, l.orden];
  }));

  sembrarSiVacio_(libro, 'Verticales', VERTICALES.map(function (v) {
    return [v.id, v.nombre, v.orden];
  }));

  sembrarSiVacio_(libro, 'Roles', ROLES.map(function (r) {
    // Las dos ultimas columnas son un resumen legible de lo que el rol puede
    // hacer. Lo que manda son las hojas Permisos_Rol y Permisos_Fase; esto es
    // para quien abre la hoja de Roles y quiere ver de que se trata cada uno.
    var fases = fasesDeRol(r.id);
    return [
      r.id,
      r.nombre,
      fases.length === 8 ? 'TODAS' : (fases.join(', ') || 'ninguna'),
      esAdministrador(r.id) ? 'Administracion'
        : (puedeOperarTablero(r.id) ? 'Opera el embudo'
        : (puedeEditarSolicitud(r.id) ? 'Edita solicitudes' : 'Consulta'))
    ];
  }));

  // Los permisos, uno por rol. Solo si la hoja esta vacia: una vez que el
  // negocio los ajusta desde Administracion, el instalador no los pisa.
  sembrarSiVacio_(libro, 'Permisos_Rol', getRoles_().map(function (r) {
    var p = getPermisos(r.id);
    return [r.id].concat(CATALOGO_PERMISOS.map(function (c) {
      return p[c.campo] ? 'SI' : 'NO';
    }));
  }));

  sembrarSiVacio_(libro, 'Permisos_Fase', getRoles_().map(function (r) {
    var fases = fasesDeRol(r.id);
    return [r.id].concat(TODAS_LAS_FASES_().map(function (f) {
      return fases.indexOf(f) !== -1 ? 'SI' : 'NO';
    }));
  }));

  // SLA por fase, en DIAS HABILES. Valores iniciales sugeridos, ajustables
  // desde la pagina de Administracion.
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
 * @return {!Array<string>} Lista de configuraciones que siguen pendientes.
 * @private
 */
function pendientesDeConfiguracion_() {
  var pendientes = [];
  if (!getChatWebhookUrl_()) {
    pendientes.push('Webhook de Google Chat: registrar con guardarConfiguracion_().');
  }
  if (!getDominioCorporativo_()) {
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
  exigirOperador_();
  var reporte = { ok: [], problemas: [] };

  [[getIdLibroParametrizacion_(), ESQUEMA_PARAMETRIZACION],
   [getIdLibroTransaccional_(), ESQUEMA_TRANSACCIONAL]].forEach(function (par) {
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

/**
 * Registra a quien ejecuta esta funcion como Administrador del sistema.
 *
 * Resuelve el arranque en frio: recien instalado, la tabla Usuarios esta vacia
 * y nadie puede entrar a la aplicacion para crear el primer usuario. Solo puede
 * ejecutarse desde el editor de Apps Script, es decir, por alguien que ya tiene
 * control del proyecto.
 *
 * Es segura de repetir: si el correo ya esta registrado, no duplica la fila.
 *
 * @return {!Object} Resultado legible de lo que hizo.
 */
function registrarmeComoAdministrador() {
  // Esta funcion otorga el rol de Administrador, asi que es la mas delicada del
  // proyecto: solo la puede ejecutar el dueno de la aplicacion, desde el editor.
  var correo = correoDeGoogle_();
  var dueno = '';
  try {
    dueno = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (e) { /* sin permiso para saberlo */ }
  if (!correo || correo !== dueno) {
    throw new Error('Solo el dueno de la aplicacion puede ejecutar esto, y desde el ' +
                    'editor de Apps Script.');
  }

  var correo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!correo) {
    throw new Error('No se pudo leer el correo de la sesion. Ejecute la funcion ' +
                    'desde el editor, con su cuenta corporativa.');
  }

  var usuarios = leerTabla_('Usuarios');
  var existente = null;
  usuarios.forEach(function (u) {
    if (String(u.Correo_ID || '').toLowerCase() === correo) existente = u;
  });

  var resultado;
  if (existente) {
    var actualizado = {};
    Object.keys(existente).forEach(function (k) {
      if (k !== '_fila') actualizado[k] = existente[k];
    });
    actualizado.Rol_ID = 'RO-08';
    actualizado.Activo = 'SI';
    escribirFila_('Usuarios', existente._fila, actualizado);
    resultado = {
      accion: 'actualizado',
      idUsuario: existente.ID_Usuario,
      correo: correo,
      mensaje: 'El usuario ya existia: se le asigno el rol Administrador y quedo activo.'
    };
  } else {
    // El nombre se deduce del correo y se puede corregir despues desde la
    // pagina de Administracion.
    var alias = correo.split('@')[0].replace(/[._-]+/g, ' ');
    var nombre = alias.split(' ').map(function (p) {
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
    }).join(' ').trim();

    var id = siguienteId_('Usuarios', 'ID_Usuario');
    agregarFila_('Usuarios', {
      ID_Usuario: id,
      Nombre_Completo: nombre || correo,
      Correo_ID: correo,
      Cargo: 'Administrador del sistema',
      Area: 'Plataformas Digitales',
      Rol_ID: 'RO-08',
      Activo: 'SI'
    });
    resultado = {
      accion: 'creado',
      idUsuario: id,
      correo: correo,
      nombre: nombre,
      mensaje: 'Usuario creado con rol Administrador. Recargue la aplicacion web.'
    };
  }

  resultado.siguientePaso = 'Abra la aplicacion web y use la pestana Admin para ' +
                            'registrar al resto del equipo y corregir su nombre o cargo.';
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


/**
 * Agrega a las hojas de catalogo los valores que existen en el codigo y todavia
 * no estan registrados.
 *
 * setupInicial() solo siembra hojas vacias, para no pisar lo que el negocio
 * haya ajustado. Cuando se suma un valor nuevo a un catalogo (una causal de
 * bloqueo, un estado, una plataforma), esta funcion lo incorpora sin tocar los
 * existentes ni duplicar nada.
 *
 * @return {!Object} Que se agrego en cada catalogo.
 */
function sincronizarCatalogos() {
  exigirOperador_();
  var catalogos = [
    { hoja: 'Fases', lista: FASES, fila: function (x) { return [x.id, x.nombre, x.orden]; } },
    { hoja: 'Estados', lista: ESTADOS, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Estados_Iniciativa', lista: ESTADOS_INICIATIVA, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Plataforma_Digital', lista: PLATAFORMAS, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Tipos_Solicitud', lista: TIPOS_SOLICITUD, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Tipos_Iniciativa', lista: TIPOS_INICIATIVA, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Prioridad', lista: PRIORIDADES, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Fabricas', lista: FABRICAS, fila: function (x) { return [x.id, x.nombre, '', '']; } },
    { hoja: 'Causales_Bloqueo', lista: CAUSALES_BLOQUEO, fila: function (x) { return [x.id, x.nombre]; } },
    { hoja: 'Lineas_Estrategicas', lista: LINEAS_ESTRATEGICAS, fila: function (x) { return [x.id, x.nombre, x.orden]; } },
    { hoja: 'Verticales', lista: VERTICALES, fila: function (x) { return [x.id, x.nombre, x.orden]; } }
  ];

  var libro = SpreadsheetApp.openById(getIdLibroParametrizacion_());
  var resumen = { agregados: [], sinCambios: [] };

  catalogos.forEach(function (cat) {
    var hoja = libro.getSheetByName(cat.hoja);
    if (!hoja) return;
    var pk = getDefinicionTabla(cat.hoja).def.pk;
    var existentes = {};
    leerTabla_(cat.hoja).forEach(function (f) { existentes[String(f[pk])] = true; });

    var nuevos = cat.lista.filter(function (x) { return !existentes[x.id]; });
    if (!nuevos.length) { resumen.sinCambios.push(cat.hoja); return; }

    var filas = nuevos.map(cat.fila);
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    invalidarTabla_(cat.hoja);
    resumen.agregados.push(cat.hoja + ': ' + nuevos.map(function (x) { return x.nombre; }).join(', '));
  });

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}
