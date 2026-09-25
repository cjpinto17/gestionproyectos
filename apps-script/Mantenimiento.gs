/**
 * Mantenimiento.gs
 * Herramientas para revisar y reparar la estructura de las hojas.
 *
 * Contexto: cuando el esquema gana una columna nueva en medio (no al final),
 * las hojas que ya existen se quedan sin ella. Si la escritura se hiciera por
 * posicion, cada valor caeria una columna a la derecha de donde corresponde y
 * Google Sheets rechazaria el dato por la validacion de la celda. Desde ahora
 * la escritura se guia por los encabezados reales de la hoja y las columnas
 * faltantes se insertan en su lugar, pero las filas escritas antes de la
 * correccion pueden haber quedado corridas: estas funciones las detectan y las
 * enderezan.
 */

/**
 * Revisa que cada hoja tenga todas las columnas que declara el esquema.
 * Las que falten se insertan en su posicion, sin tocar los datos existentes.
 * @return {!Object} Reporte por tabla.
 */
function verificarEstructura() {
  exigirOperador_();
  var reporte = { revisadas: [], ajustadas: [], sobrantes: [] };

  [ESQUEMA_PARAMETRIZACION, ESQUEMA_TRANSACCIONAL].forEach(function (esquema) {
    Object.keys(esquema).forEach(function (tabla) {
      var esperados = getEncabezados(tabla);
      var hoja;
      try { hoja = getHoja_(tabla); } catch (e) { return; }

      var antes = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1))
          .getValues()[0].map(function (v) { return String(v || ''); });
      var despues = asegurarColumnas_(tabla);

      var agregadas = esperados.filter(function (c) { return antes.indexOf(c) === -1; });
      if (agregadas.length) {
        reporte.ajustadas.push(tabla + ': se agrego ' + agregadas.join(', '));
      } else {
        reporte.revisadas.push(tabla);
      }

      var sobra = despues.filter(function (c) { return c && esperados.indexOf(c) === -1; });
      if (sobra.length) reporte.sobrantes.push(tabla + ': ' + sobra.join(', '));
    });
  });

  Logger.log(JSON.stringify(reporte, null, 2));
  return reporte;
}

/**
 * Busca filas de Solicitudes cuyos valores no corresponden a su columna.
 * No modifica nada: solo informa.
 * @return {!Object}
 */
function diagnosticarSolicitudes() {
  exigirOperador_();
  var filas = leerTabla_('Solicitudes');
  var problemas = [];

  filas.forEach(function (s) {
    var motivos = [];
    if (!/^FAS-\d\d$/.test(String(s.Fase_Actual || ''))) {
      motivos.push('Fase_Actual = "' + s.Fase_Actual + '"');
    }
    if (!/^EST-\d\d$/.test(String(s.Estado_Actual || ''))) {
      motivos.push('Estado_Actual = "' + s.Estado_Actual + '"');
    }
    if (motivos.length) {
      problemas.push({ fila: s._fila, id: s.ID_Solicitud, motivos: motivos });
    }
  });

  var reporte = {
    total: filas.length,
    correctas: filas.length - problemas.length,
    conProblemas: problemas.length,
    detalle: problemas,
    siguientePaso: problemas.length
        ? 'Ejecute repararSolicitudesDesalineadas() para enderezarlas.'
        : 'Todas las filas estan bien alineadas.'
  };
  Logger.log(JSON.stringify(reporte, null, 2));
  return reporte;
}

/**
 * Endereza las filas corridas una columna.
 *
 * Solo toca una fila si, al quitar la celda sobrante y correr el resto a la
 * izquierda, la fase y el estado pasan a ser validos. Si no lo consigue, la
 * deja intacta y la reporta para revisarla a mano: es preferible una fila
 * marcada que una fila "reparada" a ciegas.
 *
 * @return {!Object}
 */
function repararSolicitudesDesalineadas() {
  exigirOperador_();
  return conBloqueo_(function () {
    var hoja = getHoja_('Solicitudes');
    var columnas = asegurarColumnas_('Solicitudes');
    var iFase = columnas.indexOf('Fase_Actual');
    var iEstado = columnas.indexOf('Estado_Actual');
    var iOrden = columnas.indexOf('Orden_Iniciativa');
    if (iFase === -1 || iEstado === -1) {
      throw new Error('La hoja Solicitudes no tiene las columnas de fase y estado.');
    }

    var ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) return { reparadas: 0, mensaje: 'No hay filas.' };

    var rango = hoja.getRange(2, 1, ultimaFila - 1, columnas.length);
    var valores = rango.getValues();
    var reparadas = 0;
    var manuales = [];

    for (var i = 0; i < valores.length; i++) {
      var fila = valores[i];
      if (!String(fila[0] || '').trim()) continue;                 // fila vacia
      var faseOk = /^FAS-\d\d$/.test(String(fila[iFase] || ''));
      var estadoOk = /^EST-\d\d$/.test(String(fila[iEstado] || ''));
      if (faseOk && estadoOk) continue;                            // ya esta bien

      // Hipotesis: la fila se escribio antes de que existiera la columna de
      // orden, asi que todo lo que va despues quedo una posicion a la derecha.
      var prueba = fila.slice();
      if (iOrden !== -1) {
        prueba.splice(iOrden, 1);
        prueba.push('');
      }
      if (/^FAS-\d\d$/.test(String(prueba[iFase] || '')) &&
          /^EST-\d\d$/.test(String(prueba[iEstado] || ''))) {
        valores[i] = prueba;
        reparadas++;
      } else {
        manuales.push({ fila: i + 2, id: fila[0],
                        fase: fila[iFase], estado: fila[iEstado] });
      }
    }

    if (reparadas) {
      rango.setValues(valores);
      invalidarTabla_('Solicitudes');
    }

    var reporte = {
      reparadas: reparadas,
      requierenRevision: manuales,
      mensaje: reparadas
          ? reparadas + ' fila(s) enderezadas.'
          : 'No hubo filas que enderezar.'
    };
    Logger.log(JSON.stringify(reporte, null, 2));
    return reporte;
  });
}

/**
 * Pasa a "Alcance" lo que estaba escrito en "Objetivo" y "Entregable".
 *
 * Los dos campos se unieron en uno (D-66). Las columnas viejas siguen en la
 * hoja con su contenido —el sistema ya no las toca, pero tampoco las borra—,
 * asi que sin esta funcion el texto que la gente escribio quedaria invisible
 * en la aplicacion aunque siga guardado.
 *
 * Como se junta el texto:
 *   - Si los dos tienen contenido, quedan uno debajo del otro, con la etiqueta
 *     de cual era cual, para no perder la distincion que alguien si hizo.
 *   - Si solo uno tiene contenido, pasa tal cual, sin etiqueta.
 *   - Una fila que ya tenga Alcance escrito NO se toca: lo nuevo manda sobre
 *     lo viejo, siempre.
 *
 * Es segura de repetir: la segunda vez no encuentra nada que mover.
 *
 * @param {boolean=} aplicar false (o sin valor) solo informa lo que haria.
 * @return {!Object} Reporte.
 */
function unificarAlcanceSolicitudes(aplicar) {
  exigirOperador_();
  return conBloqueo_(function () {
    var columnas = asegurarColumnas_('Solicitudes');
    var iAlcance = columnas.indexOf('Alcance');
    var iObjetivo = columnas.indexOf('Objetivo');
    var iEntregable = columnas.indexOf('Entregable');

    if (iAlcance === -1) {
      throw new Error('La hoja Solicitudes no tiene la columna Alcance. ' +
                      'Ejecute actualizarEstructura() primero.');
    }
    if (iObjetivo === -1 && iEntregable === -1) {
      return { total: 0, porCambiar: 0,
               mensaje: 'La hoja no tiene columnas Objetivo ni Entregable: nada que unificar.' };
    }

    var hoja = getHoja_('Solicitudes');
    var ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) return { total: 0, porCambiar: 0, mensaje: 'No hay solicitudes.' };

    var rango = hoja.getRange(2, 1, ultimaFila - 1, columnas.length);
    var valores = rango.getValues();
    var porCambiar = 0, conservados = 0;
    var muestra = [];

    for (var i = 0; i < valores.length; i++) {
      var fila = valores[i];
      if (!String(fila[0] || '').trim()) continue;                    // fila vacia
      if (String(fila[iAlcance] || '').trim()) { conservados++; continue; }

      var objetivo = iObjetivo === -1 ? '' : String(fila[iObjetivo] || '').trim();
      var entregable = iEntregable === -1 ? '' : String(fila[iEntregable] || '').trim();
      if (!objetivo && !entregable) continue;                         // nada que mover

      var texto;
      if (objetivo && entregable) {
        texto = 'Objetivo: ' + objetivo + '\n\nEntregable: ' + entregable;
      } else {
        texto = objetivo || entregable;
      }

      if (aplicar) fila[iAlcance] = texto;
      porCambiar++;
      if (muestra.length < 5) {
        muestra.push({ id: fila[0], quedaria: texto.slice(0, 90) });
      }
    }

    if (aplicar && porCambiar) {
      rango.setValues(valores);
      invalidarTabla_('Solicitudes');
    }

    var reporte = {
      total: valores.length,
      porCambiar: porCambiar,
      conAlcancePropio: conservados,
      muestra: muestra,
      mensaje: aplicar
          ? 'Se unificaron ' + porCambiar + ' solicitudes. Las columnas Objetivo y ' +
            'Entregable quedan intactas en la hoja por si hay que volver atras.'
          : 'Simulacion: se unificarian ' + porCambiar + ' solicitudes. ' +
            'Vuelva a ejecutar con unificarAlcanceSolicitudes(true) para aplicarlo.'
    };
    Logger.log(JSON.stringify(reporte, null, 2));
    return reporte;
  });
}

/**
 * Lleva los ID de solicitud ya existentes al formato SOL-0015.
 *
 * Las solicitudes cargadas antes del cambio de formato quedaron como
 * SOL-20260923-015. Conviven sin romper nada —el sistema lee las dos formas—
 * pero el tablero termina mostrando dos estilos de codigo para lo mismo.
 *
 * Cada solicitud conserva su numero: SOL-20260915-015 pasa a ser SOL-0015. Si
 * dos codigos distintos traen el mismo consecutivo, o alguno no trae ninguno,
 * esa fila toma el siguiente numero libre al final de la serie.
 *
 * Si hay codigos repetidos no renumera nada y los reporta: con un codigo
 * duplicado no hay forma de saber a cual de las dos filas pertenece cada
 * movimiento de la bitacora.
 *
 * El ID es la llave con la que la auditoria referencia cada solicitud, asi que
 * renombrar solo la hoja de Solicitudes dejaria la bitacora apuntando al vacio
 * y los indicadores de tiempo por fase se quedarian sin historia. Por eso la
 * funcion actualiza tambien Auditoria_Transiciones y el resultado de la carga
 * masiva. No reescribe la historia: ajusta la referencia a una fila que sigue
 * siendo la misma.
 *
 * @param {boolean=} aplicar false (o sin valor) solo informa lo que haria.
 * @return {!Object} Reporte.
 */
function renumerarSolicitudes(aplicar) {
  exigirOperador_();
  return conBloqueo_(function () {
    var columnas = asegurarColumnas_('Solicitudes');
    var iId = columnas.indexOf('ID_Solicitud');
    if (iId === -1) throw new Error('La hoja Solicitudes no tiene la columna ID_Solicitud.');

    var hoja = getHoja_('Solicitudes');
    var ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) {
      return { total: 0, porCambiar: 0, mensaje: 'No hay solicitudes registradas.' };
    }

    var rango = hoja.getRange(2, iId + 1, ultimaFila - 1, 1);
    var ids = rango.getValues();

    // Un ID repetido no se puede renumerar: la auditoria referencia la
    // solicitud por su codigo, y si dos filas comparten el mismo, no hay forma
    // de saber a cual de las dos pertenece cada movimiento. Renumerarlas
    // asignaria la historia a la fila equivocada, en silencio. Se informan para
    // corregirlas a mano y no se toca nada.
    var vistos = {};
    var repetidos = [];
    ids.forEach(function (f, i) {
      var actual = String(f[0] || '').trim();
      if (!actual) return;
      if (vistos[actual]) repetidos.push({ fila: i + 2, id: actual });
      vistos[actual] = true;
    });
    if (repetidos.length) {
      var conflicto = {
        total: ids.length,
        porCambiar: 0,
        idsRepetidos: repetidos,
        mensaje: 'Hay ID de solicitud repetidos. No se renumero nada: primero ' +
                 'corrija los duplicados en la hoja, porque la bitacora referencia ' +
                 'cada solicitud por su codigo.'
      };
      Logger.log(JSON.stringify(conflicto, null, 2));
      return conflicto;
    }

    var maximo = 0;
    ids.forEach(function (f) { maximo = Math.max(maximo, consecutivoDeId_(f[0])); });

    var tomados = {};
    var cambios = [];
    var nuevos = ids.map(function (f) {
      var actual = String(f[0] || '').trim();
      if (!actual) return [''];

      var n = consecutivoDeId_(actual);
      // Sin consecutivo legible, o repetido: va al final de la serie. Nunca se
      // le quita el numero a la primera fila que lo tenia.
      if (!n || tomados[n]) n = ++maximo;
      tomados[n] = true;

      var nuevo = formatearIdSolicitud_(n);
      if (nuevo !== actual) cambios.push({ anterior: actual, nuevo: nuevo });
      return [nuevo];
    });

    if (!cambios.length) {
      var sinCambios = { total: ids.length, porCambiar: 0,
                         mensaje: 'Todos los ID ya estan en el formato SOL-0015.' };
      Logger.log(JSON.stringify(sinCambios, null, 2));
      return sinCambios;
    }

    if (!aplicar) {
      var ensayo = {
        total: ids.length,
        porCambiar: cambios.length,
        ejemplos: cambios.slice(0, 10),
        siguientePaso: 'Revise la lista y ejecute renumerarSolicitudes(true) para aplicarla.'
      };
      Logger.log(JSON.stringify(ensayo, null, 2));
      return ensayo;
    }

    var mapa = {};
    cambios.forEach(function (c) { mapa[c.anterior] = c.nuevo; });

    rango.setValues(nuevos);
    invalidarTabla_('Solicitudes');

    var referencias = actualizarReferenciasId_('Auditoria_Transiciones', 'ID_Solicitud', mapa) +
                      actualizarReferenciasId_('Carga_Solicitudes', 'Resultado', mapa);

    var reporte = {
      total: ids.length,
      renumeradas: cambios.length,
      referenciasActualizadas: referencias,
      ejemplos: cambios.slice(0, 10),
      mensaje: cambios.length + ' solicitud(es) renumeradas al formato SOL-0015.'
    };
    Logger.log(JSON.stringify(reporte, null, 2));
    return reporte;
  });
}

/**
 * Reemplaza en una columna los ID viejos por los nuevos, segun el mapa.
 * Si la hoja o la columna no existen, no hay nada que actualizar.
 *
 * @param {string} tabla
 * @param {string} campo
 * @param {!Object<string, string>} mapa ID anterior -> ID nuevo.
 * @return {number} Celdas actualizadas.
 * @private
 */
function actualizarReferenciasId_(tabla, campo, mapa) {
  var hoja;
  try { hoja = getHoja_(tabla); } catch (e) { return 0; }

  var columnas = asegurarColumnas_(tabla);
  var indice = columnas.indexOf(campo);
  if (indice === -1) return 0;

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;

  var rango = hoja.getRange(2, indice + 1, ultimaFila - 1, 1);
  var valores = rango.getValues();
  var tocadas = 0;

  for (var i = 0; i < valores.length; i++) {
    var actual = String(valores[i][0] || '').trim();
    if (mapa[actual]) {
      valores[i][0] = mapa[actual];
      tocadas++;
    }
  }

  if (tocadas) {
    rango.setValues(valores);
    invalidarTabla_(tabla);
  }
  return tocadas;
}
