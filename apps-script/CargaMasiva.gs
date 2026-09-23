/**
 * CargaMasiva.gs
 * Carga de varias solicitudes a la vez desde una hoja de preparacion.
 *
 * Como se usa:
 *   1. prepararCargaMasiva()  crea (o limpia) la hoja "Carga_Solicitudes" en el
 *      libro transaccional, con los encabezados y las listas desplegables.
 *   2. La persona completa las filas en esa hoja, con calma y sin conexion.
 *   3. procesarCargaMasiva()  valida fila por fila, crea las solicitudes con su
 *      carpeta en Drive y su auditoria, y escribe en la columna Resultado el ID
 *      generado o el motivo del rechazo.
 *
 * Es segura de repetir: las filas que ya tienen Resultado con un ID no se
 * vuelven a procesar. Las que fallaron se corrigen y se vuelve a ejecutar.
 */

/** Cuantas filas se procesan por ejecucion, para no agotar el tiempo de Apps Script. */
var CARGA_MAXIMO_POR_EJECUCION = 25;

/**
 * Deja lista la hoja de preparacion, vacia y con listas desplegables.
 * @return {!Object}
 */
function prepararCargaMasiva() {
  var libro = SpreadsheetApp.openById(getIdLibroTransaccional());
  var hoja = libro.getSheetByName('Carga_Solicitudes');
  if (!hoja) hoja = libro.insertSheet('Carga_Solicitudes');

  var columnas = getEncabezados('Carga_Solicitudes');
  if (hoja.getMaxColumns() < columnas.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), columnas.length - hoja.getMaxColumns());
  }

  var def = getDefinicionTabla('Carga_Solicitudes').def;
  hoja.getRange(1, 1, 1, columnas.length)
      .setValues([def.columnas.map(function (c) { return c.campo; })])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground(CONFIG.COLORES.NAVY);
  hoja.setFrozenRows(1);

  // Nota de ayuda en la segunda fila congelada seria intrusiva: se pone como
  // comentario del encabezado.
  def.columnas.forEach(function (c, i) {
    hoja.getRange(1, i + 1).setNote(c.etiqueta + (c.requerido ? ' (obligatorio)' : ''));
  });

  aplicarListas_(hoja, def, 500);

  var resultado = { hoja: 'Carga_Solicitudes', url: libro.getUrl() };
  hoja.autoResizeColumns(1, columnas.length);
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Pone listas desplegables en las columnas que referencian un catalogo, para
 * que quien llene la hoja elija en vez de escribir.
 * @private
 */
function aplicarListas_(hoja, def, filas) {
  var catalogos = {
    Proyectos: leerTabla('Proyectos').map(function (p) { return p.ID_Proyecto; }),
    Plataforma_Digital: PLATAFORMAS.map(function (p) { return p.id; }),
    Tipos_Solicitud: TIPOS_SOLICITUD.map(function (t) { return t.id; }),
    Prioridad: PRIORIDADES.map(function (p) { return p.id; }),
    Fases: FASES.map(function (f) { return f.id; }),
    Estados: ESTADOS.map(function (e) { return e.id; }),
    Causales_Bloqueo: CAUSALES_BLOQUEO.map(function (c) { return c.id; }),
    Usuarios: leerTabla('Usuarios').map(function (u) { return u.ID_Usuario; })
  };

  def.columnas.forEach(function (c, i) {
    var valores = null;
    if (c.fk && catalogos[c.fk]) valores = catalogos[c.fk];
    if (c.tipo === 'boolSN') valores = ['SI', 'NO'];
    if (!valores || !valores.length) return;
    var regla = SpreadsheetApp.newDataValidation()
        .requireValueInList(valores, true).setAllowInvalid(false).build();
    hoja.getRange(2, i + 1, filas, 1).setDataValidation(regla);
  });
}

/**
 * Deja listo todo lo necesario para cargar el tablero de Servicio de Recaudo:
 * sincroniza catalogos, asegura el responsable y siembra las diez solicitudes
 * con los datos que confirmo el negocio.
 *
 * Es segura de repetir: no duplica el usuario ni vuelve a escribir la hoja si
 * ya tiene filas.
 *
 * @return {!Object}
 */
function prepararCargaServicioRecaudo() {
  exigirSesion_();

  // La causal "Falta informacion de integraciones por parte de TI" es nueva:
  // se incorpora al catalogo antes de usarla.
  var catalogos = sincronizarCatalogos();

  var responsable = asegurarUsuario_('Sandra Orejarena', 'RO-02', 'Product Owner');
  var preparacion = prepararCargaMasiva();
  var sembradas = sembrarTableroRecaudo_(responsable.ID_Usuario);

  var resultado = {
    catalogos: catalogos,
    responsable: responsable.ID_Usuario + ' · ' + responsable.Nombre_Completo,
    hoja: preparacion.hoja,
    urlLibro: preparacion.url,
    filasSembradas: sembradas,
    siguientePaso: sembradas
        ? 'Revise la hoja Carga_Solicitudes y ejecute procesarCargaMasiva().'
        : 'La hoja ya tenia filas: no se sobrescribio nada.'
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Busca un usuario por nombre y lo crea si no existe. Sin correo: queda
 * asignable de inmediato y podra iniciar sesion cuando se le registre la cuenta.
 * @param {string} nombre
 * @param {string} rol
 * @param {string} cargo
 * @return {!Object} La fila del usuario.
 * @private
 */
function asegurarUsuario_(nombre, rol, cargo) {
  var buscado = nombre.trim().toLowerCase();
  var encontrado = null;
  leerTabla('Usuarios').forEach(function (u) {
    if (String(u.Nombre_Completo || '').trim().toLowerCase() === buscado) encontrado = u;
  });
  if (encontrado) return encontrado;

  var id = siguienteId_('Usuarios', 'ID_Usuario');
  var registro = {
    ID_Usuario: id,
    Nombre_Completo: nombre,
    Correo_ID: '',
    Cargo: cargo || '',
    Area: 'Plataformas Digitales',
    Rol_ID: rol,
    Activo: 'SI'
  };
  agregarFila_('Usuarios', registro);
  return registro;
}

/**
 * Siembra las diez solicitudes del tablero entregado por el negocio.
 *
 * De la imagen salen la fase, el estado, el bloqueo y el orden dentro de la
 * iniciativa; el resto son los valores que el negocio confirmo: todas son de
 * tipo Nuevo, prioridad Critica, plataforma Banca Movil, con la misma causal de
 * bloqueo y el mismo responsable. Objetivo, entregable y version quedan vacios
 * porque aun no estan definidos.
 *
 * @param {string} idResponsable
 * @return {number} Filas sembradas.
 * @private
 */
function sembrarTableroRecaudo_(idResponsable) {
  var libro = SpreadsheetApp.openById(getIdLibroTransaccional());
  var hoja = libro.getSheetByName('Carga_Solicitudes');
  if (!hoja) throw new Error('Falta la hoja Carga_Solicitudes.');
  if (hoja.getLastRow() > 1) return 0;   // no pisa lo que alguien ya escribio

  var columnas = getEncabezados('Carga_Solicitudes');
  var INICIATIVA = 'INI-008';            // Servicio de Recaudo (Pasarela)
  var CAUSAL = 'CAU-04';                 // Falta informacion de integraciones por parte de TI

  // [orden, nombre, fase, estado, bloqueo]
  var tarjetas = [
    [1, 'Onboarding banca movil (Sin integraciones)', 'FAS-05', 'EST-04', 'SI'],
    [2, 'Configuraciones y administracion de Servicio de Recaudo', 'FAS-05', 'EST-04', 'SI'],
    [3, 'Visacion y aprobacion (Matrix)', 'FAS-03', 'EST-02', 'NO'],
    [4, 'Generacion de Link de pagos (Sin integraciones)', 'FAS-04', 'EST-04', 'SI'],
    [5, 'Mejoras al administrador centralizado de servicio de recaudo', 'FAS-03', 'EST-02', 'NO'],
    [6, 'Mantenimiento del negocio (App)', 'FAS-03', 'EST-02', 'NO'],
    [7, 'Onboarding apk, web y plataforma digital', 'FAS-03', 'EST-02', 'NO'],
    [8, 'Integraciones intercom - Creacion del comercio', 'FAS-02', 'EST-04', 'SI'],
    [9, 'Integraciones intercom - Creacion del link de pagos', 'FAS-02', 'EST-04', 'SI'],
    [10, 'Integraciones Shivam - Tarifas', 'FAS-02', 'EST-04', 'SI']
  ];

  var filas = tarjetas.map(function (t) {
    var fila = {
      ID_Proyecto: INICIATIVA,
      Orden_Iniciativa: t[0],
      Nombre_Solicitud: t[1],
      Plataforma_ID: 'PL-03',            // Banca Movil
      Tipo_Solicitud: 'TIP-03',          // Nuevo
      Prioridad: 'PRI-01',               // Critica
      Fase_Actual: t[2],
      Estado_Actual: t[3],
      Tiene_Bloqueo: t[4],
      Causal_Bloqueo: t[4] === 'SI' ? CAUSAL : '',
      Responsable_ID: idResponsable
    };
    return columnas.map(function (c) { return fila[c] === undefined ? '' : fila[c]; });
  });

  hoja.getRange(2, 1, filas.length, columnas.length).setValues(filas);
  hoja.autoResizeColumns(1, columnas.length);
  return filas.length;
}

/**
 * Procesa la hoja de preparacion y crea las solicitudes.
 * @return {!Object} Resumen: creadas, rechazadas y pendientes.
 */
function procesarCargaMasiva() {
  var ctx = exigirSesion_();
  var libro = SpreadsheetApp.openById(getIdLibroTransaccional());
  var hoja = libro.getSheetByName('Carga_Solicitudes');
  if (!hoja) throw new Error('No existe la hoja Carga_Solicitudes. Ejecute prepararCargaMasiva().');

  var columnas = getEncabezados('Carga_Solicitudes');
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return { creadas: 0, rechazadas: 0, mensaje: 'La hoja no tiene filas por cargar.' };

  var valores = hoja.getRange(2, 1, ultimaFila - 1, columnas.length).getValues();
  var indiceResultado = columnas.indexOf('Resultado');
  var resumen = { creadas: 0, rechazadas: 0, pendientes: 0, detalle: [] };
  var procesadas = 0;

  for (var i = 0; i < valores.length; i++) {
    var fila = valores[i];
    var numeroFila = i + 2;
    var resultadoPrevio = String(fila[indiceResultado] || '');

    // Ya creada en una ejecucion anterior: no se repite.
    if (resultadoPrevio.indexOf('SOL-') === 0) continue;
    if (!String(fila[columnas.indexOf('Nombre_Solicitud')] || '').trim()) continue;

    if (procesadas >= CARGA_MAXIMO_POR_EJECUCION) {
      resumen.pendientes++;
      continue;
    }
    procesadas++;

    var datos = {};
    columnas.forEach(function (c, j) { datos[c] = fila[j]; });

    try {
      var creada = crearSolicitudDesdeCarga_(datos, ctx);
      hoja.getRange(numeroFila, indiceResultado + 1).setValue(creada.idSolicitud);
      resumen.creadas++;
      resumen.detalle.push({ fila: numeroFila, id: creada.idSolicitud, nombre: datos.Nombre_Solicitud });
    } catch (e) {
      hoja.getRange(numeroFila, indiceResultado + 1).setValue('ERROR: ' + e.message);
      resumen.rechazadas++;
      resumen.detalle.push({ fila: numeroFila, error: e.message, nombre: datos.Nombre_Solicitud });
    }
  }

  resumen.mensaje = resumen.pendientes
      ? 'Quedaron ' + resumen.pendientes + ' filas sin procesar. Vuelva a ejecutar la funcion.'
      : 'Carga terminada.';
  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

/**
 * Crea una solicitud a partir de una fila de la hoja de carga.
 * A diferencia del formulario de la aplicacion, aqui la fase y el estado
 * pueden venir dados: se esta registrando trabajo que ya venia en curso.
 * @private
 */
function crearSolicitudDesdeCarga_(datos, ctx) {
  return conBloqueo_(function () {
    var ahora = new Date();
    var id = generarIdSolicitud_();
    var fase = datos.Fase_Actual || 'FAS-01';
    var bloqueo = String(datos.Tiene_Bloqueo || 'NO').toUpperCase().indexOf('S') === 0 ? 'SI' : 'NO';

    if (!buscarPorPk_('Proyectos', datos.ID_Proyecto)) {
      throw new Error('La iniciativa ' + datos.ID_Proyecto + ' no existe.');
    }
    if (bloqueo === 'SI' && !datos.Causal_Bloqueo) {
      throw new Error('La solicitud esta marcada con bloqueo pero no tiene causal.');
    }

    var registro = {
      ID_Solicitud: id,
      Fecha_Registro: ahora,
      Nombre_Solicitud: String(datos.Nombre_Solicitud).trim(),
      Objetivo: datos.Objetivo || '',
      Entregable: datos.Entregable || '',
      ID_Proyecto: datos.ID_Proyecto,
      Plataforma_ID: datos.Plataforma_ID || '',
      Solicitante_ID: datos.Solicitante_ID || ctx.idUsuario,
      Tipo_Solicitud: datos.Tipo_Solicitud || '',
      Prioridad: datos.Prioridad || '',
      Orden_Iniciativa: datos.Orden_Iniciativa ||
                        siguienteOrdenIniciativa_(datos.ID_Proyecto),
      Proceso_Impactado: datos.Proceso_Impactado || '',
      Doc_Requerimiento_URL: '',
      Carpeta_Drive_URL: '',
      Fase_Actual: fase,
      Estado_Actual: datos.Estado_Actual || 'EST-01',
      Tiene_Bloqueo: bloqueo,
      Causal_Bloqueo: bloqueo === 'SI' ? datos.Causal_Bloqueo : '',
      Link_Taiga: datos.Link_Taiga || '',
      Version_Semantica: datos.Version_Semantica || '',
      Responsable_ID: datos.Responsable_ID || '',
      Fecha_Ultimo_Cambio: ahora
    };
    validarRegistro_('Solicitudes', registro, true);

    try {
      var contenedor = crearContenedorDrive_(id, registro.Plataforma_ID, registro.Nombre_Solicitud);
      registro.Carpeta_Drive_URL = contenedor.carpetaUrl;
      registro.Doc_Requerimiento_URL = contenedor.docUrl;
    } catch (e) {
      // Igual que en el alta individual: la solicitud no se pierde por Drive.
    }

    agregarFila_('Solicitudes', registro);

    // Una sola linea de auditoria que deja constancia de como entro al sistema.
    registrarTransicionAudit({
      idSolicitud: id,
      faseOrigen: '',
      faseDestino: fase,
      estadoOrigen: '',
      estadoDestino: registro.Estado_Actual,
      desde: ahora,
      correoUsuario: ctx.correo + ' (carga masiva)'
    });

    return { idSolicitud: id };
  });
}
