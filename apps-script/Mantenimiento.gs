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
  var filas = leerTabla('Solicitudes');
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
