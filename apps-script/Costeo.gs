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

/**
 * El primer y el ultimo instante de un mes 'aaaa-mm'.
 *
 * El fin es el final del ultimo dia, no su medianoche. diasHabilesEntre cuenta
 * la jornada que se traslapa con el intervalo, de modo que terminar el mes a la
 * medianoche del dia 30 hacia que ese dia aportara CERO: una tarjeta presente
 * todo septiembre contaba 21 dias habiles y no 22. Sobre un reparto proporcional
 * el efecto casi se cancela, pero los numeros no cuadraban contra un calendario,
 * que es justo lo que alguien hace al auditarlos.
 *
 * @private
 */
function limitesDelMes_(mes) {
  var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  return { inicio: new Date(a, m - 1, 1), fin: new Date(a, m, 0, 23, 59, 59, 999) };
}

/**
 * Las estadias de una solicitud, leidas de SUS columnas de fecha (D-114).
 *
 * Antes salian de la bitacora de transiciones. Se cambio porque la herramienta
 * empezo a usarse en septiembre y todavia se esta cargando historia: la bitacora
 * solo sabe de los movimientos hechos DENTRO de la aplicacion, asi que a un
 * trabajo de septiembre registrado en octubre le asignaba octubre. Las columnas
 * de fecha, en cambio, las diligencia el equipo con lo que de verdad paso.
 *
 * El precio de ese cambio es que una fecha que nadie escribio ya no se puede
 * adivinar. Y no se adivina: la etapa queda marcada como SIN INFORMACION, no
 * cuesta nada, y sale listada para que alguien la llene. Inventar un rango
 * seria repartir plata sobre un supuesto.
 *
 * @param {!Object} s La solicitud.
 * @param {!Date} hasta Hasta cuando contar lo que sigue abierto.
 * @return {{estadias: !Array<!Object>, faltantes: !Array<!Object>}}
 * @private
 */
function estadiasPorColumnas_(s, hasta) {
  var estadias = [], faltantes = [];

  /* Quien escribe "fin: 30/09" quiere decir que estuvo ahi TODO el 30, no hasta
     la medianoche con que empieza ese dia. Sin esto se perdia un dia habil por
     cada etapa de cada solicitud, siempre hacia abajo. Una fecha con hora se
     respeta tal cual: ahi la persona si dijo el momento. */
  function finDelDia(f) {
    if (!f) return f;
    if (f.getHours() || f.getMinutes() || f.getSeconds()) return f;
    return new Date(f.getFullYear(), f.getMonth(), f.getDate(), 23, 59, 59, 999);
  }

  ETAPAS_COSTO.forEach(function (etapa) {
    var esperada = etapaEsperadaDeSolicitud_(s, etapa);

    /* Si ALGUN rango de la etapa trae fechas, la etapa esta contestada y no se
       reclama el otro: Pruebas son dos fases y una solicitud que hizo QA sin UAT
       no tiene nada pendiente. Marcar un rango "no aplica" NO cuenta como
       contestar la etapa —esa marca habla de ese rango y de ningun otro—: antes
       si contaba, y marcar UAT dejaba de pedir en silencio las fechas de QA
       (D-119). */
    var conFechas = false;

    etapa.rangos.forEach(function (r) {
      var campoIni = r[0], campoFin = r[1], nombre = r[2], campoNo = r[3];

      // Marcada como "no aplica": ni cuesta ni se reclama. Es una respuesta,
      // no un vacio.
      if (esSi_(s[campoNo])) return;

      var desde = aFecha_(s[campoIni]), fin = aFecha_(s[campoFin]);
      if (!desde && !fin) return;
      conFechas = true;

      if (!desde) {
        faltantes.push(faltante_(s, etapa, r, 'Falta la fecha de inicio', campoIni));
        return;
      }
      if (!fin) {
        // Sin fecha de fin hay dos casos distintos y no se pueden confundir: la
        // solicitud sigue AHI —y entonces sigue ocupando, legitimamente— o ya
        // paso de largo y nadie cerro la fecha, que es un dato por llenar.
        if (siguenEnLaEtapa_(s, etapa)) {
          estadias.push({ etapa: etapa.id, rango: nombre, desde: desde, hasta: hasta,
                          abierta: true, campoIni: campoIni, campoFin: campoFin });
        } else {
          faltantes.push(faltante_(s, etapa, r, 'Falta la fecha de fin', campoFin));
        }
        return;
      }
      if (fin < desde) {
        faltantes.push(faltante_(s, etapa, r,
                                 'La fecha de fin es anterior a la de inicio', campoFin));
        return;
      }
      estadias.push({ etapa: etapa.id, rango: nombre, desde: desde, hasta: finDelDia(fin),
                      abierta: false, campoIni: campoIni, campoFin: campoFin });
    });

    // Una etapa por la que la solicitud ya paso y de la que no hay ni una fecha.
    // Se reclama rango por rango, saltando los que ya fueron contestados con un
    // "no aplica": si todos lo estan, no queda nada que pedir.
    if (!conFechas && esperada) {
      etapa.rangos.forEach(function (r) {
        if (esSi_(s[r[3]])) return;
        faltantes.push(faltante_(s, etapa, r,
                                 'Sin información: no tiene fechas registradas', r[0]));
      });
    }
  });

  return { estadias: estadias, faltantes: faltantes };
}

/**
 * Un pendiente de diligenciar, con todo lo que hace falta para llenarlo sin
 * salir de la pagina: las dos columnas del rango y lo que hoy tienen.
 * @private
 */
function faltante_(s, etapa, rango, falta, campo) {
  return { id: s.ID_Solicitud, etapa: etapa.id, etapaNombre: etapa.nombre,
           rango: rango[2], falta: falta, campo: campo,
           campoIni: rango[0], campoFin: rango[1], campoNo: rango[3],
           valorIni: s[rango[0]] || '', valorFin: s[rango[1]] || '' };
}

/**
 * ¿Esa solicitud ya deberia tener fechas en esa etapa?
 *
 * Solo se reclama lo que falta de verdad: una solicitud que sigue en Backlog no
 * tiene por que tener fechas de desarrollo, y listarla como incompleta seria
 * ruido que esconde las que si hay que llenar.
 *
 * @private
 */
function etapaEsperadaDeSolicitud_(s, etapa) {
  if (esTipoEstabilizacion(s.Tipo_Solicitud)) {
    // Una estabilizacion no recorre fases: en cuanto arranca consume desarrollo
    // y pruebas, y sus fechas las escribe el equipo a mano.
    return ETAPAS_DE_ESTABILIZACION.indexOf(etapa.id) !== -1 &&
           String(s.Estado_Actual || '') !== 'EST-01';
  }
  var actual = ordenDeFase(s.Fase_Actual);
  var minima = Math.min.apply(null, etapa.fases.map(function (f) { return ordenDeFase(f); }));
  return actual >= minima;
}

/** ¿La solicitud esta parada ahora mismo dentro de esa etapa? @private */
function siguenEnLaEtapa_(s, etapa) {
  if (esTipoEstabilizacion(s.Tipo_Solicitud)) {
    return ETAPAS_DE_ESTABILIZACION.indexOf(etapa.id) !== -1 &&
           String(s.Estado_Actual || '') === 'EST-02';
  }
  return etapa.fases.indexOf(String(s.Fase_Actual || '')) !== -1;
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
function getCostos(desde, hasta, forzar) {
  exigirPermiso_('Ver_Costos', 'Su rol no puede ver los costos de la fabrica.');
  var d = String(desde || ''), h = String(hasta || '');

  /* Lo que alguien edita A MANO en el Sheets no invalida nada: los sellos solo
     se mueven cuando escribe la aplicacion. Con las fechas y las marcas de "no
     aplica" eso se nota de inmediato —se corrige una fila en la hoja, se vuelve
     a Costos y sale igual que antes—, y uno concluye que el programa las ignora.
     Por eso el boton Calcular relee de verdad: relee las hojas del costeo y
     recalcula sin tocar la cache de resultados (D-120). */
  if (forzar) {
    ['Solicitudes', 'Costos_Fabrica', 'Proyectos'].forEach(function (t) {
      try { invalidarTabla_(t); } catch (e) { /* una hoja que no esta no estorba */ }
    });
    return calcularCostos_(d, h);
  }

  return conResultadoEnCache_('costos_' + d + '_' + h, function () {
    return calcularCostos_(d, h);
  });
}

/**
 * Reparte una cantidad entera de pesos en proporcion a unos pesos relativos.
 *
 * Metodo del residuo mayor: cada quien recibe su parte redondeada hacia abajo y
 * los pesos que sobran van, de a uno, a quienes quedaron con el residuo mas
 * grande. La suma de las partes es SIEMPRE el total: ni un peso se pierde ni se
 * inventa, que es lo que permite auditar la tabla sumandola.
 *
 * @param {number} total Pesos a repartir.
 * @param {!Array<number>} pesos Lo que pondera a cada quien (dias habiles).
 * @return {!Array<number>} Enteros que suman exactamente total.
 * @private
 */
function repartirEnteros_(total, pesos) {
  var suma = pesos.reduce(function (a, p) { return a + p; }, 0);
  if (!suma) return pesos.map(function () { return 0; });

  var entero = Math.round(total);
  var partes = [], residuos = [], asignado = 0;
  for (var i = 0; i < pesos.length; i++) {
    var exacto = entero * pesos[i] / suma;
    var piso = Math.floor(exacto);
    partes.push(piso);
    residuos.push({ i: i, r: exacto - piso });
    asignado += piso;
  }

  residuos.sort(function (a, b) { return b.r - a.r; });
  for (var k = 0; k < entero - asignado; k++) partes[residuos[k % residuos.length].i]++;
  return partes;
}

/**
 * El calculo de verdad. Vive aparte para que getCostos pueda servirlo de cache.
 * @param {string} desde
 * @param {string} hasta
 * @param {boolean=} conDetalle true para traer ademas la bitacora del calculo.
 * @return {!Object}
 * @private
 */
function calcularCostos_(desde, hasta, conDetalle) {
  // La hoja puede no existir todavia: la pagina llega con el despliegue, pero la
  // hoja solo aparece cuando alguien corre actualizarEstructura. Eso no es un
  // error del programa y no debe salir como tal —una excepcion deja la pantalla
  // a medio pintar y quien la ve no sabe que hacer—, sino una instruccion.
  var tarifas;
  try {
    tarifas = leerTabla_('Costos_Fabrica');
  } catch (e) {
    return { sinTarifas: true, desde: desde, hasta: hasta,
             mensaje: 'Falta crear la hoja Costos_Fabrica. En el editor de Apps ' +
                      'Script ejecute la función actualizarEstructura y vuelva a entrar.' };
  }
  tarifas = tarifas.filter(function (t) {
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

  // dias[mes][etapa][idSolicitud] = dias habiles
  var dias = {};
  var diasDeSolicitud = {};
  var diasPorEtapa = {};         // id -> etapa -> dias
  var rangosDeSolicitud = {};    // id -> etapa -> { desde, hasta, abierta }
  var estancias = [];            // la bitacora del costeo, para poder auditarla
  var incompletas = [];          // lo que al equipo le falta por diligenciar

  var marcadas = 0;
  costeables.forEach(function (s) {
    ETAPAS_COSTO.forEach(function (e) {
      e.rangos.forEach(function (ra) { if (esSi_(s[ra[3]])) marcadas++; });
    });

    var r = estadiasPorColumnas_(s, fin);

    r.faltantes.forEach(function (f) {
      incompletas.push({ id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
                         idProyecto: s.ID_Proyecto || '', tipo: s.Tipo_Solicitud,
                         fase: s.Fase_Actual || '', estado: s.Estado_Actual || '',
                         etapa: f.etapa, rango: f.rango, falta: f.falta, campo: f.campo });
    });

    r.estadias.forEach(function (e) {
      // El rango que se muestra en pantalla es el ENTERO, no el recorte del mes:
      // es la fecha que el equipo escribio y contra la que va a verificar.
      var re = rangosDeSolicitud[s.ID_Solicitud] = rangosDeSolicitud[s.ID_Solicitud] || {};
      var ya = re[e.etapa];
      re[e.etapa] = { desde: (ya && ya.desde < e.desde) ? ya.desde : e.desde,
                      hasta: (ya && ya.hasta > e.hasta) ? ya.hasta : e.hasta,
                      abierta: (ya && ya.abierta) || e.abierta };

      var porMes = diasPorMesDeEstadia_(e, meses);
      Object.keys(porMes).forEach(function (mes) {
        dias[mes] = dias[mes] || {};
        dias[mes][e.etapa] = dias[mes][e.etapa] || {};
        dias[mes][e.etapa][s.ID_Solicitud] =
            (dias[mes][e.etapa][s.ID_Solicitud] || 0) + porMes[mes];
        diasDeSolicitud[s.ID_Solicitud] =
            (diasDeSolicitud[s.ID_Solicitud] || 0) + porMes[mes];
        var pe = diasPorEtapa[s.ID_Solicitud] = diasPorEtapa[s.ID_Solicitud] || {};
        pe[e.etapa] = (pe[e.etapa] || 0) + porMes[mes];
        estancias.push({ id: s.ID_Solicitud, etapa: e.etapa, mes: mes,
                         desde: e.desde, hasta: e.hasta, abierta: !!e.abierta,
                         sitio: e.rango, dias: porMes[mes] });
      });
    });
  });

  /* --- 2. Reparto de cada bolsa, mes por mes --- */
  var costoDeSolicitud = {};     // id -> { total, porEtapa }
  var porMes = {};               // mes -> { contrato, atribuido }
  var porEtapa = {};             // etapa -> { costo, dias }
  var cargado = {};              // mes -> etapa -> true si alguna bolsa pago ahi
  var bolsas = [];
  var reparto = [];              // cada peso, con la bolsa y el mes de donde salio

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

      // El reparto se redondea a pesos enteros AQUI, no al final, y el sobrante
      // se entrega a los residuos mas grandes. Redondear cada total por separado
      // deja diferencias de unos pesos entre la suma de las filas y el total, y
      // en una tabla que alguien va a sumar con la calculadora eso es un error,
      // por pequeno que sea. Asi cada bolsa se reparte completa, sin sobras.
      var partes = repartirEnteros_(valor, candidatos.map(function (id) {
        return enEtapa[id];
      }));

      candidatos.forEach(function (id, i) {
        var parte = partes[i];
        var c = costoDeSolicitud[id] = costoDeSolicitud[id] || { total: 0, porEtapa: {} };
        c.total += parte;
        c.porEtapa[etapa] = (c.porEtapa[etapa] || 0) + parte;
        reparto.push({ mes: mes, etapa: etapa, bolsa: t.ID_Costo,
                       concepto: resumen.concepto, valorBolsa: valor,
                       dedicada: dedicada, id: id, dias: enEtapa[id],
                       diasTotales: totalDias, costo: parte });
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
      dias: red_(diasDeSolicitud[id] || 0, 1),
      costo: c.total,                      // ya es entero y la suma cuadra
      porEtapa: c.porEtapa,
      diasPorEtapa: diasPorEtapa[id] || {},
      rangos: rangosDeSolicitud[id] || {}
    });
  });

  var contrato = bolsas.reduce(function (a, b) { return a + b.total; }, 0);
  var atribuido = bolsas.reduce(function (a, b) { return a + b.atribuido; }, 0);

  function porcentaje(parte) { return contrato ? red_(parte * 100 / contrato) : null; }

  var listaIniciativas = Object.keys(iniciativas).map(function (k) {
    var i = iniciativas[k];
    i.pct = porcentaje(i.costo);
    return i;
  }).sort(function (a, b) { return b.costo - a.costo; });

  return {
    desde: meses[0] || '', hasta: meses[meses.length - 1] || '', meses: meses,
    moneda: 'COP', iva: false,
    total: {
      contrato: contrato,
      atribuido: atribuido,
      noAtribuido: contrato - atribuido,
      pctAtribuido: porcentaje(atribuido),
      actividades: actividades.length
    },
    porIniciativa: listaIniciativas,
    porTipo: Object.keys(tipos).map(function (k) {
      tipos[k].pct = porcentaje(tipos[k].costo);
      return tipos[k];
    }).sort(function (a, b) { return b.costo - a.costo; }),
    porEtapa: ETAPAS_COSTO.map(function (e) {
      var x = porEtapa[e.id] || { costo: 0, dias: 0 };
      return { etapa: e.id, nombre: e.nombre, costo: x.costo, dias: red_(x.dias, 1),
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
    actividades: actividades.sort(function (a, b) { return b.costo - a.costo; }),
    // La bitacora del calculo. Pesa, asi que solo viaja cuando la piden para
    // exportarla: la pagina no la necesita para pintar.
    // Lo que falta por diligenciar. Va SIEMPRE, no solo en la exportacion: es
    // la explicacion de por que hay plata sin atribuir, y mientras no se vea
    // nadie la llena.
    incompletas: incompletas,
    // Cuantas fases estan marcadas "no aplica" en los datos que se acaban de
    // leer. Si alguien marca cinco y aqui llega cero, el problema no es el
    // calculo: es que la marca no esta en la hoja.
    fasesNoAplican: marcadas,
    detalle: conDetalle ? { estancias: estancias, reparto: reparto } : null
  };
}

/* ================================================================== */
/* El archivo de auditoria                                             */
/* ================================================================== */

/**
 * Genera una hoja de calculo con TODO lo que hay detras de cada peso (D-113).
 *
 * Existe porque un costo que no se puede rastrear hasta la fecha que lo origino
 * no sirve para negociar nada: la primera pregunta que recibe es "y esto de
 * donde sale". El archivo responde esa pregunta en tres niveles:
 *
 *   1. Estancias — donde estuvo cada solicitud, desde cuando y hasta cuando, y
 *      cuantos dias habiles de cada mes aporto. Es la respuesta a "por que algo
 *      de septiembre me aparece en octubre".
 *   2. Reparto — cada peso: de que bolsa salio, de que mes, contra cuantos dias
 *      propios sobre cuantos dias totales.
 *   3. Resumen — una fila por solicitud, que es lo que muestra la pagina.
 *
 * Sale del MISMO calculo que alimenta la pantalla, no de uno paralelo: dos
 * caminos para la misma cifra terminan, tarde o temprano, dando cifras
 * distintas, y entonces no se sabe cual creer.
 *
 * @param {string=} desde 'aaaa-mm'.
 * @param {string=} hasta 'aaaa-mm'.
 * @return {!Object} { url, nombre, filas }
 */
function getCostosDetalle(desde, hasta) {
  exigirPermiso_('Ver_Costos', 'Su rol no puede ver los costos de la fabrica.');

  var r = calcularCostos_(String(desde || ''), String(hasta || ''), true);
  if (r.sinTarifas) throw new Error(r.mensaje);

  var etapas = mapaEtapasCosto_();
  var porId = {};
  r.actividades.forEach(function (a) { porId[a.id] = a; });
  var nombreEtapa = function (id) { return etapas[id] ? etapas[id].nombre : id; };
  var proyectos = {};
  cargarDatos_().proyectos.forEach(function (p) { proyectos[p.ID_Proyecto] = p.Nombre_Proyecto; });
  var nombreDeProyecto = function (id) { return proyectos[id] || 'Sin iniciativa'; };

  var libro = SpreadsheetApp.create(
      'Costos de la fábrica · ' + r.desde + ' a ' + r.hasta + ' · ' +
      Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm'));

  /* --- 1. Estancias: de donde salen los dias --- */
  var fechas = function (d) {
    return d ? Utilities.formatDate(new Date(d), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm') : '';
  };
  var estancias = [['ID solicitud', 'Actividad', 'Iniciativa', 'Tipo', 'Etapa',
                    'Rango registrado', 'Fecha de inicio', 'Fecha de fin',
                    '¿Sin fecha de fin?', 'Mes', 'Días hábiles del mes']];
  r.detalle.estancias.forEach(function (e) {
    var a = porId[e.id] || {};
    estancias.push([e.id, a.nombre || '', a.iniciativa || '', a.tipoNombre || '',
                    nombreEtapa(e.etapa), e.sitio, fechas(e.desde), fechas(e.hasta),
                    e.abierta ? 'SÍ, sigue en curso' : 'no', e.mes,
                    Math.round(e.dias * 100) / 100]);
  });
  escribirHoja_(libro, 'Estancias', estancias, 0);

  /* --- 2. Reparto: de donde sale cada peso --- */
  var reparto = [['Mes', 'Etapa', 'Bolsa', 'Concepto', 'Valor mensual de la bolsa',
                  'Dedicada a', 'ID solicitud', 'Actividad', 'Días de la solicitud',
                  'Días totales en la etapa ese mes', 'Participación', 'Costo asignado']];
  r.detalle.reparto.forEach(function (x) {
    var a = porId[x.id] || {};
    reparto.push([x.mes, nombreEtapa(x.etapa), x.bolsa, x.concepto, x.valorBolsa,
                  x.dedicada || 'todas', x.id, a.nombre || '',
                  Math.round(x.dias * 100) / 100,
                  Math.round(x.diasTotales * 100) / 100,
                  x.diasTotales ? x.dias / x.diasTotales : 0,
                  x.costo]);
  });
  escribirHoja_(libro, 'Reparto', reparto, 1);

  /* --- 3. Resumen: lo que muestra la pagina --- */
  var resumen = [['ID', 'Actividad', 'Iniciativa', 'Tipo']];
  ETAPAS_COSTO.forEach(function (e) {
    resumen[0].push('Días ' + e.nombre, 'Costo ' + e.nombre);
  });
  resumen[0].push('Días totales', 'Costo total');
  r.actividades.forEach(function (a) {
    var fila = [a.id, a.nombre, a.iniciativa, a.tipoNombre];
    ETAPAS_COSTO.forEach(function (e) {
      fila.push(Math.round((a.diasPorEtapa[e.id] || 0) * 100) / 100,
                a.porEtapa[e.id] || 0);
    });
    fila.push(a.dias, a.costo);
    resumen.push(fila);
  });
  escribirHoja_(libro, 'Resumen por actividad', resumen, 2);

  /* --- 4. Las bolsas, tal como se facturaron --- */
  var bolsas = [['Bolsa', 'Concepto', 'Etapa', 'Dedicada a', 'Valor mensual',
                 'Meses vigentes en el período', 'Facturado', 'Repartido', 'Sin atribuir']];
  r.bolsas.forEach(function (b) {
    bolsas.push([b.id, b.concepto, b.etapaNombre, b.dedicada || 'todas', b.mensual,
                 b.meses, b.total, b.atribuido, b.noAtribuido]);
  });
  bolsas.push([]);
  bolsas.push(['', 'TOTAL DEL PERÍODO', '', '', '', '', r.total.contrato,
               r.total.atribuido, r.total.noAtribuido]);
  escribirHoja_(libro, 'Bolsas', bolsas, 3);

  /* --- 5. Lo que falta por diligenciar --- */
  var faltan = [['ID solicitud', 'Actividad', 'Iniciativa', 'Tipo', 'Fase actual',
                 'Etapa', 'Rango', 'Qué falta', 'Columna que hay que llenar']];
  r.incompletas.forEach(function (f) {
    faltan.push([f.id, f.nombre, nombreDeProyecto(f.idProyecto), f.tipo, f.fase,
                 nombreEtapa(f.etapa), f.rango, f.falta, f.campo]);
  });
  escribirHoja_(libro, 'Información faltante', faltan, 4);

  var sobra = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (sobra) libro.deleteSheet(sobra);

  return { url: libro.getUrl(), nombre: libro.getName(),
           filas: r.detalle.reparto.length, actividades: r.actividades.length,
           incompletas: r.incompletas.length };
}

/**
 * Escribe una hoja del archivo de auditoria, con su encabezado destacado.
 * @private
 */
function escribirHoja_(libro, nombre, filas, posicion) {
  var hoja = libro.insertSheet(nombre, posicion);
  var ancho = filas.reduce(function (a, f) { return Math.max(a, f.length); }, 1);
  var normalizadas = filas.map(function (f) {
    var copia = f.slice();
    while (copia.length < ancho) copia.push('');
    return copia;
  });

  hoja.getRange(1, 1, normalizadas.length, ancho).setValues(normalizadas);
  hoja.getRange(1, 1, 1, ancho)
      .setFontWeight('bold')
      .setFontColor(CONFIG.COLORES.BLANCO)
      .setBackground(CONFIG.COLORES.NAVY);
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, Math.min(ancho, 20));
  return hoja;
}

/* ================================================================== */
/* Llenar las fechas que faltan, sin salir de la pagina                */
/* ================================================================== */

/**
 * Las columnas de fecha que el costeo lee, y solo esas (D-115).
 *
 * Es una LISTA BLANCA, no una comodidad: registrarFechasEtapa recibe nombres de
 * columna del navegador, y sin esto seria un metodo publico capaz de escribir
 * cualquier campo de cualquier solicitud. Se deriva de ETAPAS_COSTO para que no
 * puedan separarse: una etapa nueva trae sus columnas y nadie tiene que
 * acordarse de agregarlas aqui.
 *
 * @return {!Object<string,boolean>}
 * @private
 */
function columnasDeFechaDelCosteo_() {
  var permitidas = {};
  ETAPAS_COSTO.forEach(function (e) {
    e.rangos.forEach(function (r) {
      permitidas[r[0]] = true; permitidas[r[1]] = true; permitidas[r[3]] = true;
    });
  });
  return permitidas;
}

/**
 * Registra las fechas de una etapa desde el aviso de informacion faltante.
 *
 * Existe para que llenar un dato que la propia pagina esta reclamando no cueste
 * ir a buscar la solicitud a otra pantalla: el aviso dice que falta y ahi mismo
 * se llena. Escribe UNICAMENTE columnas de fecha del costeo, y exige el mismo
 * permiso que editar la solicitud completa, porque es editarla.
 *
 * @param {string} idSolicitud
 * @param {!Object<string,string>} fechas Columna -> valor ('' para borrar).
 * @return {!Object} Lo que quedo guardado.
 */
function registrarFechasEtapa(idSolicitud, fechas) {
  exigirPermiso_('Editar_Solicitud', 'Su rol no puede editar solicitudes.');

  var permitidas = columnasDeFechaDelCosteo_();
  var pedidas = Object.keys(fechas || {});
  if (!pedidas.length) throw new Error('No se recibió ninguna fecha.');

  pedidas.forEach(function (c) {
    if (!permitidas[c]) throw new Error('La columna "' + c + '" no es una fecha del costeo.');
  });

  return conBloqueo_(function () {
    var actual = buscarPorPk_('Solicitudes', idSolicitud);
    if (!actual) throw new Error('No existe la solicitud ' + idSolicitud + '.');

    var nuevo = {};
    Object.keys(actual).forEach(function (k) { if (k !== '_fila') nuevo[k] = actual[k]; });
    pedidas.forEach(function (c) { nuevo[c] = fechas[c]; });

    // "No aplica" y unas fechas son contradictorios. Gana la marca y las fechas
    // se borran, para que nadie las vea despues y crea que algo se perdio.
    ETAPAS_COSTO.forEach(function (e) {
      e.rangos.forEach(function (r) {
        nuevo[r[3]] = esSi_(nuevo[r[3]]) ? 'SI' : 'NO';
        if (nuevo[r[3]] === 'SI') { nuevo[r[0]] = ''; nuevo[r[1]] = ''; }
      });
    });

    normalizarFechas_('Solicitudes', nuevo);

    // Un rango al reves no se guarda: entraria al costeo como un dato valido y
    // produciria dias negativos o cero sin que nadie se entere.
    ETAPAS_COSTO.forEach(function (e) {
      e.rangos.forEach(function (r) {
        var ini = aFecha_(nuevo[r[0]]), fin = aFecha_(nuevo[r[1]]);
        if (ini && fin && fin < ini) {
          throw new Error('En "' + r[2] + '" la fecha de fin es anterior a la de inicio.');
        }
      });
    });

    escribirFila_('Solicitudes', actual._fila, nuevo);

    var guardadas = {};
    pedidas.forEach(function (c) { guardadas[c] = nuevo[c]; });
    return { id: idSolicitud, fechas: guardadas };
  });
}
