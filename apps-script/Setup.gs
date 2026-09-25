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

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
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
    actuales.splice(posicion - 1, 0, campo);
  });
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
 * Verifica que exista la plantilla de requerimiento; si no, crea un Google Doc
 * base con la estructura minima del formato oficial.
 * @param {!Object} resumen
 * @private
 */
function asegurarPlantillaRequerimiento_(resumen) {
  var id = getProp_(PROP_KEYS.PLANTILLA_REQUERIMIENTO, false);
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
  guardarConfiguracion_(defineProp_(PROP_KEYS.PLANTILLA_REQUERIMIENTO, doc.getId()));
  resumen.creado.push(CONFIG.NOMBRE_PLANTILLA_REQUERIMIENTO + ' (' + doc.getId() + ')');
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
