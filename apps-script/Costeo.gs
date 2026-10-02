/**
 * Costeo.gs
 * Cuanto cuesta la fabrica, repartido entre lo que la ocupo (D-110).
 *
 * NO se llama Costos.gs: Apps Script le quita la extension a cada archivo, de
 * modo que Costos.gs y Costos.html pelearian por el mismo nombre y Google
 * rechaza la subida entera. Hay una comprobacion que lo vigila.
 *
 * EL PRINCIPIO
 * ------------
 * No se compran actividades: se compra CAPACIDAD por mes. La factura corre
 * igual haya tres solicitudes o treinta. Entonces la pregunta correcta no es
 * "cuanto costo esta solicitud" sino "cuanta capacidad ocupo", y la factura del
 * mes se reparte en esa proporcion.
 *
 * El dato existe: la bitacora registra cuando cada actividad entro y salio de
 * cada fase, asi que se sabe cuantos dias habiles estuvo en cada etapa, mes por
 * mes. Esa permanencia es la unidad de reparto.
 *
 * LO QUE ESTE ARCHIVO NO HACE
 * ---------------------------
 * No inventa permanencia. Una solicitud sin movimientos registrados no ocupa
 * nada y no carga nada; si por eso una parte de la factura no encuentra a quien
 * cargarse, se reporta aparte en lugar de repartirse a la fuerza.
 */

/** Las etapas, por su identificador, para no recorrer la lista cada vez. */
function mapaEtapasCosto_() {
  return ETAPAS_COSTO.reduce(function (acc, e) { acc[e.id] = e; return acc; }, {});
}

/**
 * Clave de mes de una fecha: 'aaaa-mm'.
 * @param {!Date} f
 * @return {string}
 * @private
 */
function mesDe_(f) {
  return Utilities.formatDate(f, CONFIG.ZONA_HORARIA, 'yyyy-MM');
}

/**
 * Los meses entre dos fechas, inclusive.
 * @param {!Date} desde
 * @param {!Date} hasta
 * @return {!Array<string>}
 * @private
 */
function mesesEntre_(desde, hasta) {
  var meses = [];
  var cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
  var fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
  while (cursor <= fin) {
    meses.push(mesDe_(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return meses;
}

/** El primer y el ultimo dia de un mes 'aaaa-mm'. @private */
function limitesDelMes_(mes) {
  var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  return { inicio: new Date(a, m - 1, 1), fin: new Date(a, m, 0) };
}

/**
 * Reconstruye por donde paso una solicitud y cuanto tiempo estuvo en cada sitio.
 *
 * Sale de la bitacora y no de las columnas de fecha de la solicitud, porque las
 * columnas guardan una sola entrada y una sola salida por fase: una solicitud
 * devuelta de QA a Desarrollo vuelve a ocupar desarrollo, y eso solo lo sabe la
 * bitacora. El costo tiene que cobrar las dos estadias.
 *
 * @param {!Array<!Object>} transiciones Las de ESA solicitud, ordenadas.
 * @param {!Object} s La solicitud.
 * @param {!Date} hasta Hasta cuando contar lo que sigue abierto.
 * @return {!Array<{desde: !Date, hasta: !Date, etapa: string}>}
 * @private
 */
function estadiasDeSolicitud_(transiciones, s, hasta) {
  var estabilizacion = esTipoEstabilizacion(s.Tipo_Solicitud);
  var estadias = [];

  // Donde empezo: la fase (o el estado) con que nacio, desde su registro.
  var sitio = estabilizacion
      ? (transiciones.length ? transiciones[0].Estado_Origen : s.Estado_Actual)
      : (transiciones.length ? transiciones[0].Fase_Origen : s.Fase_Actual);
  var desde = aFecha_(s.Fecha_Registro);

  function cerrar(hastaFecha) {
    if (!desde || !hastaFecha || hastaFecha < desde) return;
    // Una estabilizacion En progreso ocupa desarrollo Y pruebas a la vez.
    var etapas = estabilizacion
        ? (sitio === 'EST-02' ? ETAPAS_DE_ESTABILIZACION : [])
        : (etapaDeFase(sitio) ? [etapaDeFase(sitio).id] : []);
    etapas.forEach(function (idEtapa) {
      estadias.push({ desde: desde, hasta: hastaFecha, etapa: idEtapa });
    });
  }

  transiciones.forEach(function (t) {
    var cuando = aFecha_(t.Fecha_Hora_Cambio);
    if (!cuando) return;
    cerrar(cuando);
    sitio = estabilizacion ? t.Estado_Destino : t.Fase_Destino;
    desde = cuando;
  });
  cerrar(hasta);

  return estadias;
}

/**
 * Dias habiles que una estadia aporta a cada mes.
 *
 * En dias HABILES, como todo lo demas en la aplicacion. Una estadia que cabe
 * entera en un fin de semana aporta un dia, para que no salga gratis algo que
 * si ocupo un cupo.
 *
 * @param {!Object} estadia
 * @param {!Array<string>} meses Los del periodo que se esta costeando.
 * @return {!Object<string,number>} mes -> dias
 * @private
 */
function diasPorMesDeEstadia_(estadia, meses) {
  var salida = {};
  meses.forEach(function (mes) {
    var lim = limitesDelMes_(mes);
    var ini = estadia.desde > lim.inicio ? estadia.desde : lim.inicio;
    var fin = estadia.hasta < lim.fin ? estadia.hasta : lim.fin;
    if (fin < ini) return;
    var dias = diasHabilesEntre(ini, fin);
    if (!dias) dias = 1;                 // cayo entera en fin de semana o festivo
    salida[mes] = (salida[mes] || 0) + dias;
  });
  return salida;
}

/**
 * El calculo completo: cuanto costo cada solicitud, cada iniciativa y cada
 * etapa en el periodo.
 *
 * @param {string=} desde 'aaaa-mm'. Por omision, el primer mes con tarifa.
 * @param {string=} hasta 'aaaa-mm'. Por omision, el mes de hoy.
 * @return {!Object}
 */
function getCostos(desde, hasta) {
  exigirPermiso_('Ver_Costos', 'Su rol no puede ver los costos de la fabrica.');
  var d = String(desde || ''), h = String(hasta || '');
  return conResultadoEnCache_('costos_' + d + '_' + h, function () {
    return calcularCostos_(d, h);
  });
}

/**
 * El calculo de verdad. Vive aparte para que getCostos pueda servirlo de cache.
 * @param {string} desde
 * @param {string} hasta
 * @return {!Object}
 * @private
 */
function calcularCostos_(desde, hasta) {
  var tarifas = leerTabla_('Costos_Fabrica').filter(function (t) {
    return t.ID_Costo && Number(t.Valor_Mensual) > 0;
  });
  var etapas = mapaEtapasCosto_();
  var hoy = new Date();

  if (!tarifas.length) {
    return { sinTarifas: true, desde: desde, hasta: hasta,
             mensaje: 'Todavía no hay tarifas registradas. Se cargan en ' +
                      'Administración → Costos de la fábrica.' };
  }

  // El periodo: lo que pidieron, o desde la primera tarifa hasta hoy.
  var primeros = tarifas.map(function (t) { return aFecha_(t.Vigencia_Desde); })
      .filter(function (f) { return !!f; }).sort(function (a, b) { return a - b; });
  var inicio = desde ? limitesDelMes_(desde).inicio
                     : (primeros.length ? primeros[0] : hoy);
  var fin = hasta ? limitesDelMes_(hasta).fin : hoy;
  if (fin > hoy) fin = hoy;              // el futuro no se ha consumido
  var meses = mesesEntre_(inicio, fin);

  /* --- 1. Permanencia: dias de cada solicitud, por mes y etapa --- */
  var datos = cargarDatos_();
  var costeables = datos.solicitudes.filter(function (s) {
    return entraEnCosteo(s.Tipo_Solicitud);
  });
  var porId = {};
  costeables.forEach(function (s) { porId[s.ID_Solicitud] = s; });

  var transiciones = {};
  datos.auditoria.forEach(function (t) {
    if (!porId[t.ID_Solicitud]) return;
    (transiciones[t.ID_Solicitud] = transiciones[t.ID_Solicitud] || []).push(t);
  });
  Object.keys(transiciones).forEach(function (id) {
    transiciones[id].sort(function (a, b) {
      return marcaDeTiempo_(a.Fecha_Hora_Cambio) - marcaDeTiempo_(b.Fecha_Hora_Cambio);
    });
  });

  // dias[mes][etapa][idSolicitud] = dias habiles
  var dias = {};
  var diasDeSolicitud = {};
  costeables.forEach(function (s) {
    estadiasDeSolicitud_(transiciones[s.ID_Solicitud] || [], s, fin).forEach(function (e) {
      var porMes = diasPorMesDeEstadia_(e, meses);
      Object.keys(porMes).forEach(function (mes) {
        dias[mes] = dias[mes] || {};
        dias[mes][e.etapa] = dias[mes][e.etapa] || {};
        dias[mes][e.etapa][s.ID_Solicitud] =
            (dias[mes][e.etapa][s.ID_Solicitud] || 0) + porMes[mes];
        diasDeSolicitud[s.ID_Solicitud] =
            (diasDeSolicitud[s.ID_Solicitud] || 0) + porMes[mes];
      });
    });
  });

  /* --- 2. Reparto de cada bolsa, mes por mes --- */
  var costoDeSolicitud = {};     // id -> { total, porEtapa }
  var porMes = {};               // mes -> { contrato, atribuido }
  var porEtapa = {};             // etapa -> { costo, dias }
  var cargado = {};              // mes -> etapa -> true si alguna bolsa pago ahi
  var bolsas = [];

  tarifas.forEach(function (t) {
    var etapa = String(t.Etapa || '');
    var valor = Number(t.Valor_Mensual) || 0;
    var dedicada = String(t.ID_Proyecto || '').trim();
    var vDesde = aFecha_(t.Vigencia_Desde), vHasta = aFecha_(t.Vigencia_Hasta);
    var resumen = { id: t.ID_Costo, concepto: t.Concepto || t.ID_Costo, etapa: etapa,
                    etapaNombre: etapas[etapa] ? etapas[etapa].nombre : etapa,
                    dedicada: dedicada, mensual: valor,
                    meses: 0, total: 0, atribuido: 0, noAtribuido: 0 };

    meses.forEach(function (mes) {
      var lim = limitesDelMes_(mes);
      if (vDesde && lim.fin < vDesde) return;
      if (vHasta && lim.inicio > vHasta) return;

      resumen.meses++;
      resumen.total += valor;
      porMes[mes] = porMes[mes] || { contrato: 0, atribuido: 0 };
      porMes[mes].contrato += valor;

      var enEtapa = (dias[mes] && dias[mes][etapa]) || {};
      // Una bolsa dedicada solo se reparte entre las actividades de su iniciativa.
      var candidatos = Object.keys(enEtapa).filter(function (id) {
        return !dedicada || porId[id].ID_Proyecto === dedicada;
      });
      var totalDias = candidatos.reduce(function (a, id) { return a + enEtapa[id]; }, 0);

      if (!totalDias) {
        // Nadie de los que costeamos ocupo esa etapa ese mes: la plata se gasto
        // igual, pero no hay a quien cargarsela. Se reporta, no se reparte.
        resumen.noAtribuido += valor;
        return;
      }

      resumen.atribuido += valor;
      porMes[mes].atribuido += valor;
      porEtapa[etapa] = porEtapa[etapa] || { costo: 0, dias: 0 };
      porEtapa[etapa].costo += valor;
      // Los dias NO se suman aqui: desarrollo tiene tres bolsas y cada una
      // recorreria los mismos dias, de modo que el costo por dia saldria
      // dividido entre tres. Se cuentan una sola vez despues del reparto.
      cargado[mes] = cargado[mes] || {};
      cargado[mes][etapa] = true;

      candidatos.forEach(function (id) {
        var parte = valor * enEtapa[id] / totalDias;
        var c = costoDeSolicitud[id] = costoDeSolicitud[id] || { total: 0, porEtapa: {} };
        c.total += parte;
        c.porEtapa[etapa] = (c.porEtapa[etapa] || 0) + parte;
      });
    });

    bolsas.push(resumen);
  });

  /* Los dias de capacidad de cada etapa, contados UNA vez: son los dias habiles
     que las solicitudes ocuparon la etapa, no la suma por bolsa. Solo cuentan
     los meses en que esa etapa tuvo costo: si ninguna bolsa estaba vigente, esos
     dias no se pagaron y meterlos bajaria el costo por dia sin razon. */
  Object.keys(dias).forEach(function (mes) {
    Object.keys(dias[mes]).forEach(function (etapa) {
      if (!cargado[mes] || !cargado[mes][etapa]) return;
      porEtapa[etapa] = porEtapa[etapa] || { costo: 0, dias: 0 };
      porEtapa[etapa].dias += Object.keys(dias[mes][etapa]).reduce(function (a, id) {
        return a + dias[mes][etapa][id];
      }, 0);
    });
  });

  /* --- 3. Agregados --- */
  var nombreProyecto = {};
  datos.proyectos.forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  var nombreTipo = mapaCatalogo_(getTiposSolicitud_());

  var iniciativas = {}, tipos = {};
  var actividades = [];
  Object.keys(costoDeSolicitud).forEach(function (id) {
    var s = porId[id], c = costoDeSolicitud[id];
    var idProy = s.ID_Proyecto || 'SIN_INICIATIVA';
    var ini = iniciativas[idProy] = iniciativas[idProy] ||
        { idProyecto: idProy, nombre: nombreProyecto[idProy] || 'Sin iniciativa',
          costo: 0, actividades: 0, porEtapa: {}, porTipo: {} };
    ini.costo += c.total;
    ini.actividades++;
    Object.keys(c.porEtapa).forEach(function (e) {
      ini.porEtapa[e] = (ini.porEtapa[e] || 0) + c.porEtapa[e];
    });
    ini.porTipo[s.Tipo_Solicitud] = (ini.porTipo[s.Tipo_Solicitud] || 0) + c.total;

    tipos[s.Tipo_Solicitud] = tipos[s.Tipo_Solicitud] ||
        { tipo: s.Tipo_Solicitud, nombre: nombreTipo[s.Tipo_Solicitud] || s.Tipo_Solicitud,
          costo: 0, actividades: 0 };
    tipos[s.Tipo_Solicitud].costo += c.total;
    tipos[s.Tipo_Solicitud].actividades++;

    actividades.push({
      id: id, nombre: s.Nombre_Solicitud,
      idProyecto: idProy, iniciativa: nombreProyecto[idProy] || 'Sin iniciativa',
      tipo: s.Tipo_Solicitud, tipoNombre: nombreTipo[s.Tipo_Solicitud] || s.Tipo_Solicitud,
      fase: s.Fase_Actual || '', estado: s.Estado_Actual || '',
      dias: diasDeSolicitud[id] || 0,
      costo: Math.round(c.total),
      porEtapa: c.porEtapa
    });
  });

  var contrato = bolsas.reduce(function (a, b) { return a + b.total; }, 0);
  var atribuido = bolsas.reduce(function (a, b) { return a + b.atribuido; }, 0);

  function porcentaje(parte) { return contrato ? red_(parte * 100 / contrato) : null; }

  var listaIniciativas = Object.keys(iniciativas).map(function (k) {
    var i = iniciativas[k];
    i.costo = Math.round(i.costo);
    i.pct = porcentaje(i.costo);
    Object.keys(i.porEtapa).forEach(function (e) { i.porEtapa[e] = Math.round(i.porEtapa[e]); });
    Object.keys(i.porTipo).forEach(function (t) { i.porTipo[t] = Math.round(i.porTipo[t]); });
    return i;
  }).sort(function (a, b) { return b.costo - a.costo; });

  return {
    desde: meses[0] || '', hasta: meses[meses.length - 1] || '', meses: meses,
    moneda: 'COP', iva: false,
    total: {
      contrato: Math.round(contrato),
      atribuido: Math.round(atribuido),
      noAtribuido: Math.round(contrato - atribuido),
      pctAtribuido: porcentaje(atribuido),
      actividades: actividades.length
    },
    porIniciativa: listaIniciativas,
    porTipo: Object.keys(tipos).map(function (k) {
      tipos[k].costo = Math.round(tipos[k].costo);
      tipos[k].pct = porcentaje(tipos[k].costo);
      return tipos[k];
    }).sort(function (a, b) { return b.costo - a.costo; }),
    porEtapa: ETAPAS_COSTO.map(function (e) {
      var x = porEtapa[e.id] || { costo: 0, dias: 0 };
      return { etapa: e.id, nombre: e.nombre, costo: Math.round(x.costo), dias: x.dias,
               costoPorDia: x.dias ? Math.round(x.costo / x.dias) : null };
    }),
    porMes: meses.map(function (m) {
      var x = porMes[m] || { contrato: 0, atribuido: 0 };
      return { mes: m, contrato: Math.round(x.contrato), atribuido: Math.round(x.atribuido),
               noAtribuido: Math.round(x.contrato - x.atribuido) };
    }),
    bolsas: bolsas.map(function (b) {
      b.total = Math.round(b.total);
      b.atribuido = Math.round(b.atribuido);
      b.noAtribuido = Math.round(b.noAtribuido);
      b.dedicadaNombre = b.dedicada ? (nombreProyecto[b.dedicada] || b.dedicada) : '';
      b.sinIniciativa = !!b.dedicada && !nombreProyecto[b.dedicada];
      return b;
    }),
    actividades: actividades.sort(function (a, b) { return b.costo - a.costo; })
  };
}
