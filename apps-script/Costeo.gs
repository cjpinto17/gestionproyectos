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

/**
 * Cuantos pendientes viajan al navegador. El resto se cuenta, no se manda.
 * @private
 */
var TOPE_INCOMPLETAS = 200;

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
 * El final del dia de una fecha sin hora.
 *
 * Quien escribe "fin: 30/09" quiere decir que estuvo ahi TODO el 30, no hasta la
 * medianoche con que ese dia empieza. Sin esto se perdia un dia habil por cada
 * etapa y por cada solicitud, siempre hacia abajo. Una fecha CON hora se respeta
 * tal cual: ahi la persona si dijo el momento. Lo usan las estadias y tambien la
 * vigencia de las bolsas (D-126).
 *
 * @private
 */
function finDelDia_(f) {
  if (!f) return f;
  if (f.getHours() || f.getMinutes() || f.getSeconds()) return f;
  return new Date(f.getFullYear(), f.getMonth(), f.getDate(), 23, 59, 59, 999);
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
        // Sin fecha de fin, la estadia se corta en el ULTIMO DIA DEL MES que se
        // esta costeando: lo que siga ocupando en los meses siguientes se cobra
        // contra la bolsa de esos meses. Cuenta siempre, este la solicitud
        // todavia en la fase o haya pasado de largo sin que nadie cerrara la
        // fecha: la capacidad se ocupo igual (D-123).
        estadias.push({ etapa: etapa.id, rango: nombre, desde: desde, hasta: hasta,
                        abierta: true, campoIni: campoIni, campoFin: campoFin });
        // Que cueste no quiere decir que el dato este completo: si la solicitud
        // ya salio de la fase, la fecha de fin sigue haciendo falta y se pide.
        if (!siguenEnLaEtapa_(s, etapa)) {
          faltantes.push(faltante_(s, etapa, r, 'Falta la fecha de fin', campoFin));
        }
        return;
      }
      if (fin < desde) {
        faltantes.push(faltante_(s, etapa, r,
                                 'La fecha de fin es anterior a la de inicio', campoFin));
        return;
      }
      estadias.push({ etapa: etapa.id, rango: nombre, desde: desde, hasta: finDelDia_(fin),
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
  // valorMarca es lo que el programa LEYO en la columna de "no aplica". Va en el
  // aviso porque sin el no habia manera de distinguir "el calculo me ignora" de
  // "la marca no quedo guardada", y eso dejaba a quien usa la herramienta sin
  // nada que mirar (D-121).
  var marca = s[rango[3]];
  return { id: s.ID_Solicitud, etapa: etapa.id, etapaNombre: etapa.nombre,
           rango: rango[2], falta: falta, campo: campo,
           campoIni: rango[0], campoFin: rango[1], campoNo: rango[3],
           valorMarca: (marca === undefined || marca === null || marca === '')
               ? '' : String(marca),
           valorIni: s[rango[0]] || '', valorFin: s[rango[1]] || '' };
}

/**
 * Revisa que la hoja tenga de verdad las columnas de "no aplica" (D-121).
 *
 * Dos cosas invisibles hacen que una marca no sirva, y las dos se ven igual
 * desde afuera —la actividad sigue saliendo como pendiente—:
 *
 *   - La columna NO EXISTE en la hoja, porque nadie corrio actualizarEstructura
 *     despues del cambio. Entonces el programa lee vacio siempre.
 *   - La columna esta DOS VECES. leerTabla_ arma cada fila con el encabezado,
 *     asi que manda la ultima: alguien escribe el SI en la primera y el programa
 *     lee la segunda, que esta vacia.
 *
 * @return {!Object} { sinColumna: [], duplicadas: [] }
 * @private
 */
function revisarColumnasDeMarcas_() {
  var salida = { sinColumna: [], duplicadas: [] };
  try {
    var hoja = getHoja_('Solicitudes');
    var ancho = Math.max(hoja.getLastColumn(), 1);
    var enc = hoja.getRange(1, 1, 1, ancho).getValues()[0]
        .map(function (v) { return String(v || '').trim(); });

    var cuenta = {};
    enc.forEach(function (c) { if (c) cuenta[c] = (cuenta[c] || 0) + 1; });

    ETAPAS_COSTO.forEach(function (e) {
      e.rangos.forEach(function (r) {
        var c = r[3];
        if (!cuenta[c]) salida.sinColumna.push(c);
        else if (cuenta[c] > 1) salida.duplicadas.push(c + ' (×' + cuenta[c] + ')');
      });
    });
  } catch (err) {
    // Si la hoja no se puede leer, el costeo ya fallara con un mensaje mejor.
  }
  return salida;
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
    return planoParaElNavegador_(calcularCostos_(d, h));
  }

  return conResultadoEnCache_('costos_' + d + '_' + h, function () {
    return calcularCostos_(d, h);
  });
}

/**
 * La liquidacion de una factura: base, AIU, IVA y total.
 *
 * El AIU se SUMA al valor facturado y el IVA grava todo lo facturado, AIU
 * incluido. Las dos cosas son configuracion de cada fabrica (hoja Fabricas) y
 * no reglas del codigo: no todas las cobran.
 *
 * Vive en una funcion propia porque la usan dos caminos —el documento del mes
 * abierto y el cierre que lo congela— y dos copias de esta aritmetica
 * terminarian pagando cifras distintas segun por donde se mirara.
 *
 * @param {number} base Lo atribuido a solicitudes, que es lo que se factura.
 * @param {!Object} fabrica Fila de Fabricas (puede venir vacia).
 * @return {!Object}
 */
function liquidarFactura_(base, fabrica) {
  var f = fabrica || {};
  var si = function (v) { return String(v || '').trim().toUpperCase() === 'SI'; };
  var pct = function (v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  };

  var aplicaAIU = si(f.Aplica_AIU);
  var pctAIU = aplicaAIU ? pct(f.Porcentaje_AIU) : 0;
  var valorAIU = Math.round(base * pctAIU / 100);

  // El IVA grava la base MAS el AIU: es todo lo que la fabrica esta cobrando.
  var subtotal = base + valorAIU;
  var aplicaIVA = si(f.Aplica_IVA);
  var pctIVA = aplicaIVA ? pct(f.Porcentaje_IVA) : 0;
  var valorIVA = Math.round(subtotal * pctIVA / 100);

  return {
    base: base,
    aplicaAIU: aplicaAIU, pctAIU: pctAIU, valorAIU: valorAIU,
    subtotal: subtotal,
    aplicaIVA: aplicaIVA, pctIVA: pctIVA, valorIVA: valorIVA,
    total: subtotal + valorIVA
  };
}

/**
 * Deja el resultado en JSON puro antes de mandarlo al navegador (D-122).
 *
 * El camino con cache pasa por JSON para guardarse, asi que el navegador siempre
 * recibio texto y numeros. El camino que recalcula devolvia el objeto CRUDO, con
 * Date adentro: otra forma del mismo dato. Que una pantalla reciba dos formas
 * segun por donde vino el calculo es un error esperando ocurrir —y ocurrio: al
 * oprimir Calcular, el navegador recibio null y se cayo al pintar.
 *
 * @private
 */
function planoParaElNavegador_(valor) {
  return JSON.parse(JSON.stringify(valor));
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
  var detalleMarcadas = [];
  costeables.forEach(function (s) {
    ETAPAS_COSTO.forEach(function (e) {
      e.rangos.forEach(function (ra) {
        if (!esSi_(s[ra[3]])) return;
        marcadas++;
        // Quien esta marcado, no solo cuantos: una marca puesta sin querer saca
        // la solicitud del costeo y sin la lista no hay como encontrarla.
        if (detalleMarcadas.length < TOPE_INCOMPLETAS) {
          detalleMarcadas.push({ id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
                                 rango: ra[2], campoNo: ra[3] });
        }
      });
    });

    var r = estadiasPorColumnas_(s, fin);

    r.faltantes.forEach(function (f) {
      // Se copia el pendiente COMPLETO y se le agrega el contexto de la
      // solicitud. Antes se volvian a listar los campos uno por uno y se
      // quedaron por fuera los nombres de columna —campoIni, campoFin,
      // campoNo—, que son justo los que el formulario de "Llenar fechas"
      // necesita para saber que escribir: llegaban vacios y no se guardaba
      // nada. Enumerar a mano lo que ya existe es una lista que envejece sola
      // (D-121).
      var item = { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
                   idProyecto: s.ID_Proyecto || '', tipo: s.Tipo_Solicitud,
                   fase: s.Fase_Actual || '', estado: s.Estado_Actual || '' };
      Object.keys(f).forEach(function (k) { item[k] = f[k]; });
      incompletas.push(item);
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
  var pagados = {};              // mes -> etapa -> id -> true si alguna bolsa le pago
  var bolsas = [];
  var reparto = [];              // cada peso, con la bolsa y el mes de donde salio
  /* Plataforma -> mes -> costo. Se acumula DENTRO del reparto y no se recalcula
     despues sobre la lista de actividades: asi cada peso entra una sola vez y
     por el mismo camino que el resto de la pagina, y la tabla no puede decir un
     total distinto del que ya esta arriba. Tambien tiene que ser aqui porque la
     bitacora del reparto solo viaja cuando se pide la exportacion. */
  var porPlataformaMes = {};

  /* Que iniciativas tienen bolsa PROPIA en cada mes.
     Una iniciativa con capacidad dedicada se paga UNICAMENTE con sus bolsas y no
     toca la general en NINGUNA etapa: lo contrario seria pagar dos veces la
     misma gente. Su costo del mes es, exactamente, la suma de sus bolsas.
     Consecuencia conocida y aceptada: los dias que esa iniciativa ocupe en una
     etapa donde no tiene bolsa propia no cuestan nada, y la bolsa general de esa
     etapa se reparte entre las demas (D-124). */
  var nombreFabrica = mapaFabricas();
  var conBolsaPropia = {};      // mes -> idProyecto -> true
  tarifas.forEach(function (t) {
    var ded = String(t.ID_Proyecto || '').trim();
    if (!ded) return;
    var vD = aFecha_(t.Vigencia_Desde), vH = aFecha_(t.Vigencia_Hasta);
    meses.forEach(function (mes) {
      var lim = limitesDelMes_(mes);
      if (vD && lim.fin < vD) return;
      if (vH && lim.inicio > vH) return;
      conBolsaPropia[mes] = conBolsaPropia[mes] || {};
      conBolsaPropia[mes][ded] = true;
    });
  });

  tarifas.forEach(function (t) {
    var etapa = String(t.Etapa || '');
    var valor = Number(t.Valor_Mensual) || 0;
    var dedicada = String(t.ID_Proyecto || '').trim();
    var vDesde = aFecha_(t.Vigencia_Desde), vHasta = aFecha_(t.Vigencia_Hasta);
    var fabrica = String(t.ID_Fabrica || '').trim();
    var resumen = { id: t.ID_Costo, concepto: t.Concepto || t.ID_Costo, etapa: etapa,
                    etapaNombre: etapas[etapa] ? etapas[etapa].nombre : etapa,
                    dedicada: dedicada, mensual: valor,
                    // A quien se le paga. Vacio NO se reparte entre las demas:
                    // se informa aparte, porque colar una bolsa en la factura
                    // equivocada es un pago mal hecho (D-132).
                    fabrica: fabrica,
                    fabricaNombre: fabrica ? (nombreFabrica[fabrica] || fabrica) : '',
                    sinFabrica: !fabrica,
                    vigenciaDesde: vDesde ? claveDia_(vDesde) : '',
                    vigenciaHasta: vHasta ? claveDia_(vHasta) : '',
                    habiles: 0, habilesPosibles: 0,
                    meses: 0, total: 0, atribuido: 0, noAtribuido: 0 };

    meses.forEach(function (mes) {
      var lim = limitesDelMes_(mes);
      if (vDesde && lim.fin < vDesde) return;
      if (vHasta && lim.inicio > vHasta) return;

      /* Una bolsa cuya vigencia no cubre el mes completo solo cobra la parte que
         le corresponde. Antes se cobraba el mes entero por tocarlo un solo dia:
         una capacidad que entra el 20 de septiembre facturaba septiembre
         completo. Se prorratea por DIAS HABILES —no por dias calendario— porque
         lo que se compra es gente disponible en dias de trabajo, que es la misma
         unidad con la que se reparte (D-126). */
      var desdeMes = (vDesde && vDesde > lim.inicio) ? vDesde : lim.inicio;
      var hastaMes = (vHasta && finDelDia_(vHasta) < lim.fin) ? finDelDia_(vHasta) : lim.fin;
      var habilesMes = diasHabilesEntre(lim.inicio, lim.fin) || 0;
      var habilesVigentes = diasHabilesEntre(desdeMes, hastaMes) || 0;
      var fraccion = habilesMes ? Math.min(habilesVigentes / habilesMes, 1) : 0;
      var valorMes = Math.round(valor * fraccion);
      if (!valorMes) return;              // vigencia que no alcanza ni un dia habil

      resumen.meses += red_(fraccion, 2);
      resumen.habiles += red_(habilesVigentes, 2);
      resumen.habilesPosibles += red_(habilesMes, 2);
      if (fraccion < 1) resumen.parcial = true;
      resumen.total += valorMes;
      porMes[mes] = porMes[mes] || { contrato: 0, atribuido: 0 };
      porMes[mes].contrato += valorMes;

      var enEtapa = (dias[mes] && dias[mes][etapa]) || {};
      var propias = conBolsaPropia[mes] || {};
      var candidatos = Object.keys(enEtapa).filter(function (id) {
        var proy = porId[id].ID_Proyecto;
        // Una bolsa dedicada solo alcanza a las actividades de su iniciativa.
        if (dedicada) return proy === dedicada;
        // Y la general no alcanza a ninguna iniciativa que tenga bolsa propia.
        return !propias[proy];
      });
      var totalDias = candidatos.reduce(function (a, id) { return a + enEtapa[id]; }, 0);

      if (!totalDias) {
        // Nadie de los que costeamos ocupo esa etapa ese mes: la plata se gasto
        // igual, pero no hay a quien cargarsela. Se reporta, no se reparte.
        resumen.noAtribuido += valorMes;
        return;
      }

      resumen.atribuido += valorMes;
      porMes[mes].atribuido += valorMes;
      porEtapa[etapa] = porEtapa[etapa] || { costo: 0, dias: 0 };
      porEtapa[etapa].costo += valorMes;
      // Los dias NO se suman aqui: desarrollo tiene tres bolsas y cada una
      // recorreria los mismos dias, de modo que el costo por dia saldria
      // dividido entre tres. Se anota QUIEN cobro, y los dias se cuentan una
      // sola vez despues del reparto.
      pagados[mes] = pagados[mes] || {};
      pagados[mes][etapa] = pagados[mes][etapa] || {};
      candidatos.forEach(function (id) { pagados[mes][etapa][id] = true; });

      // El reparto se redondea a pesos enteros AQUI, no al final, y el sobrante
      // se entrega a los residuos mas grandes. Redondear cada total por separado
      // deja diferencias de unos pesos entre la suma de las filas y el total, y
      // en una tabla que alguien va a sumar con la calculadora eso es un error,
      // por pequeno que sea. Asi cada bolsa se reparte completa, sin sobras.
      var partes = repartirEnteros_(valorMes, candidatos.map(function (id) {
        return enEtapa[id];
      }));

      candidatos.forEach(function (id, i) {
        var parte = partes[i];
        var c = costoDeSolicitud[id] = costoDeSolicitud[id] || { total: 0, porEtapa: {} };
        c.total += parte;
        c.porEtapa[etapa] = (c.porEtapa[etapa] || 0) + parte;
        // La plataforma es la de la SOLICITUD: una iniciativa puede tocar varias.
        var plat = (porId[id] || {}).Plataforma_ID || '';
        porPlataformaMes[plat] = porPlataformaMes[plat] || {};
        porPlataformaMes[plat][mes] = (porPlataformaMes[plat][mes] || 0) + parte;

        reparto.push({ mes: mes, etapa: etapa, bolsa: t.ID_Costo,
                       concepto: resumen.concepto, valorBolsa: valorMes,
                       mensual: valor,
                       dedicada: dedicada, id: id, dias: enEtapa[id],
                       diasTotales: totalDias, costo: parte });
      });
    });

    bolsas.push(resumen);
  });

  /* Los dias de capacidad de cada etapa, contados UNA vez y solo los que de
     verdad cobraron. Los dias de una iniciativa con bolsa propia en una etapa
     donde no la tiene no cuestan nada (D-124): meterlos en el denominador
     bajaria el costo por dia de una capacidad que esos dias no consumieron. */
  Object.keys(pagados).forEach(function (mes) {
    Object.keys(pagados[mes]).forEach(function (etapa) {
      porEtapa[etapa] = porEtapa[etapa] || { costo: 0, dias: 0 };
      porEtapa[etapa].dias += Object.keys(pagados[mes][etapa]).reduce(function (a, id) {
        return a + ((dias[mes] && dias[mes][etapa] && dias[mes][etapa][id]) || 0);
      }, 0);
    });
  });

  /* --- 3. Agregados --- */
  var nombreProyecto = {};
  datos.proyectos.forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });
  var nombreTipo = mapaCatalogo_(getTiposSolicitud_());
  /* La plataforma sale de la SOLICITUD y no de su iniciativa: una iniciativa
     puede tocar varias, y lo que se esta costeando es el trabajo de cada
     solicitud. */
  var nombrePlataforma = mapaPlataformas();

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
      plataformaId: s.Plataforma_ID || '',
      plataforma: nombrePlataforma[s.Plataforma_ID] || (s.Plataforma_ID || ''),
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
    /* Cuanto costo cada plataforma, mes a mes. Una fila por plataforma y una
       columna por mes del periodo; los meses se repiten de 'meses' para que la
       tabla tenga columna aunque una plataforma no haya costado nada ese mes
       —un mes que desaparece de la tabla se lee como un mes sin datos, no como
       un mes sin trabajo en esa plataforma—. */
    porPlataforma: (function () {
      var filas = Object.keys(porPlataformaMes).map(function (k) {
        var pm = porPlataformaMes[k];
        var total = meses.reduce(function (a, m) { return a + (pm[m] || 0); }, 0);
        return {
          plataformaId: k,
          nombre: k ? (nombrePlataforma[k] || k) : 'Sin plataforma',
          sinPlataforma: !k,
          porMes: meses.map(function (m) { return { mes: m, costo: pm[m] || 0 }; }),
          total: total,
          pct: porcentaje(total)
        };
      });
      // Lo mas caro primero, pero "Sin plataforma" siempre al final: no es una
      // plataforma, es lo que falta por diligenciar.
      return filas.sort(function (a, b) {
        if (a.sinPlataforma !== b.sinPlataforma) return a.sinPlataforma ? 1 : -1;
        return b.total - a.total;
      });
    }()),
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
    // La lista completa puede ser de miles de lineas si el equipo viene
    // atrasado con las fechas. Nadie lee mil, y una respuesta enorme corre el
    // riesgo de no llegar entera al navegador —que es como se cae esta pantalla:
    // sin error, con la respuesta vacia—. Se mandan las primeras y se dice
    // cuantas son en total.
    incompletas: incompletas.slice(0, TOPE_INCOMPLETAS),
    incompletasTotal: incompletas.length,
    // Cuantas fases estan marcadas "no aplica" en los datos que se acaban de
    // leer. Si alguien marca cinco y aqui llega cero, el problema no es el
    // calculo: es que la marca no esta en la hoja.
    fasesNoAplican: marcadas,
    noAplicaDetalle: detalleMarcadas,
    // Por que una marca podria no estar sirviendo. Vacio = las columnas estan bien.
    revisionColumnas: revisarColumnasDeMarcas_(),
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
                  'Valor cobrado en el mes (según vigencia)',
                  'Dedicada a', 'ID solicitud', 'Actividad', 'Días de la solicitud',
                  'Días totales en la etapa ese mes', 'Participación', 'Costo asignado']];
  r.detalle.reparto.forEach(function (x) {
    var a = porId[x.id] || {};
    reparto.push([x.mes, nombreEtapa(x.etapa), x.bolsa, x.concepto, x.mensual,
                  x.valorBolsa, x.dedicada || 'todas', x.id, a.nombre || '',
                  Math.round(x.dias * 100) / 100,
                  Math.round(x.diasTotales * 100) / 100,
                  x.diasTotales ? x.dias / x.diasTotales : 0,
                  x.costo]);
  });
  escribirHoja_(libro, 'Reparto', reparto, 1);

  /* --- 3. Resumen: lo que muestra la pagina --- */
  var resumen = [['ID', 'Actividad', 'Iniciativa', 'Plataforma', 'Tipo']];
  ETAPAS_COSTO.forEach(function (e) {
    resumen[0].push('Días ' + e.nombre, 'Costo ' + e.nombre);
  });
  resumen[0].push('Días totales', 'Costo total');
  r.actividades.forEach(function (a) {
    var fila = [a.id, a.nombre, a.iniciativa, a.plataforma || '', a.tipoNombre];
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
                 'Vigencia desde', 'Vigencia hasta', 'Días hábiles vigentes',
                 'Días hábiles del período', 'Meses vigentes en el período',
                 'Facturado', 'Repartido', 'Sin atribuir']];
  r.bolsas.forEach(function (b) {
    bolsas.push([b.id, b.concepto, b.etapaNombre, b.dedicada || 'todas', b.mensual,
                 b.vigenciaDesde || 'sin límite', b.vigenciaHasta || 'sin límite',
                 b.habiles, b.habilesPosibles,
                 b.meses, b.total, b.atribuido, b.noAtribuido]);
  });
  bolsas.push([]);
  bolsas.push(['', 'TOTAL DEL PERÍODO', '', '', '', '', '', '', '', '',
               r.total.contrato, r.total.atribuido, r.total.noAtribuido]);
  escribirHoja_(libro, 'Bolsas', bolsas, 3);

  /* --- 5. Lo que falta por diligenciar --- */
  var faltan = [['ID solicitud', 'Actividad', 'Iniciativa', 'Tipo', 'Fase actual',
                 'Etapa', 'Rango', 'Qué falta', 'Columna que hay que llenar']];
  r.incompletas.forEach(function (f) {
    faltan.push([f.id, f.nombre, nombreDeProyecto(f.idProyecto), f.tipo, f.fase,
                 nombreEtapa(f.etapa), f.rango, f.falta, f.campo]);
  });
  escribirHoja_(libro, 'Información faltante', faltan, 4);

  /* --- 6. Plataforma por mes: la misma tabla de la pagina --- */
  var plat = [['Plataforma'].concat(r.porMes.map(function (m) { return m.mes; }))
              .concat(['Total', '% del período'])];
  r.porPlataforma.forEach(function (f) {
    plat.push([f.nombre].concat(f.porMes.map(function (x) { return x.costo; }))
              .concat([f.total, f.pct]));
  });
  plat.push(['TOTAL'].concat(r.porMes.map(function (m, i) {
    return r.porPlataforma.reduce(function (a, f) { return a + f.porMes[i].costo; }, 0);
  })).concat([r.total.atribuido, r.total.pctAtribuido]));
  escribirHoja_(libro, 'Plataforma por mes', plat, 5);

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

/* ================================================================== */
/* La facturacion por fabrica (D-132)                                  */
/* ================================================================== */

/**
 * Lo que hay que pagarle a cada fabrica de software en un mes.
 *
 * Decision del usuario: el monto a facturar es lo ATRIBUIDO a solicitudes, no la
 * capacidad contratada. Se le advirtio la consecuencia —si falta una fecha, esa
 * capacidad no entra en la factura— y la tomo asi. Por eso el documento lleva,
 * fuera del total y claramente separada, una linea de conciliacion con lo
 * contratado y la diferencia: quien autoriza el pago tiene que poder ver que
 * esta pagando menos que el contrato, y la fabrica lo va a notar.
 *
 * Una bolsa sin fabrica asignada NO se reparte ni se suma a ninguna: va a un
 * bloque aparte. Colarla en la factura equivocada es un pago mal hecho.
 *
 * @param {string} mes 'yyyy-MM'.
 * @return {!Object}
 */
function getFacturacion(mes) {
  exigirPermiso_('Ver_Costos', 'Su rol no puede ver los costos de la fabrica.');
  var m = mesDeFacturacion_(mes);
  return conResultadoEnCache_('factura_' + m, function () {
    return planoParaElNavegador_(calcularFacturacion_(m));
  }, versionDatos_());
}

/**
 * Normaliza y valida un mes de facturacion.
 * @private
 */
function mesDeFacturacion_(mes) {
  var m = String(mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) {
    throw new Error('Indique el mes a facturar en formato aaaa-mm.');
  }
  return m;
}

/**
 * El cierre vigente de un mes, si lo hay.
 *
 * La hoja es un registro de movimientos: cerrar y reabrir dejan filas, y vale
 * el ULTIMO movimiento de cada mes y fabrica. Asi un cierre equivocado se puede
 * deshacer sin borrar la historia de que ocurrio.
 *
 * @param {string} mes
 * @return {!Object} { cerrado, fecha, usuario, nota, cuantas, porFabrica }
 * @private
 */
function cierreDelMes_(mes) {
  var filas;
  try {
    filas = leerTabla_('Cierres_Facturacion');
  } catch (e) {
    return { cerrado: false, porFabrica: {} };   // la hoja aun no existe
  }

  var ultimo = {};
  filas.filter(function (f) { return String(f.Mes) === mes; })
       .forEach(function (f) {
         var previo = ultimo[f.ID_Fabrica];
         if (!previo || String(f.Fecha_Cierre) >= String(previo.Fecha_Cierre)) {
           ultimo[f.ID_Fabrica] = f;
         }
       });

  var porFabrica = {}, fecha = '', usuario = '', nota = '', cuantas = 0;
  Object.keys(ultimo).forEach(function (id) {
    var f = ultimo[id];
    if (String(f.Estado_Cierre).toUpperCase() !== 'CERRADO') return;
    porFabrica[id] = {
      base: Number(f.Base) || 0,
      pctAIU: Number(f.Porcentaje_AIU) || 0, valorAIU: Number(f.Valor_AIU) || 0,
      pctIVA: Number(f.Porcentaje_IVA) || 0, valorIVA: Number(f.Valor_IVA) || 0,
      total: Number(f.Total) || 0,
      fecha: f.Fecha_Cierre, usuario: f.Usuario_Cierre
    };
    cuantas++;
    // El cierre se hace de una sola vez, asi que todas las filas comparten
    // fecha y autor; se toma el mas reciente por si alguna se rehizo.
    if (String(f.Fecha_Cierre) >= String(fecha)) {
      fecha = f.Fecha_Cierre; usuario = f.Usuario_Cierre; nota = f.Nota || '';
    }
  });

  return { cerrado: cuantas > 0, fecha: fecha, usuario: usuario, nota: nota,
           cuantas: cuantas, porFabrica: porFabrica };
}

/**
 * Cierra un mes de facturacion: congela lo que se le paga a cada fabrica.
 *
 * Solo el administrador. Despues de cerrar, cambiar el porcentaje de AIU o de
 * IVA ya no toca ese mes: el documento sigue diciendo lo que se pago.
 *
 * @param {string} mes 'yyyy-MM'.
 * @param {string=} nota Para que quede por que se cerro, si hace falta.
 * @return {!Object}
 */
function cerrarMesFacturacion(mes, nota) {
  var ctx = exigirAdministrador_();
  var m = mesDeFacturacion_(mes);

  return conBloqueo_(function () {
    if (cierreDelMes_(m).cerrado) {
      throw new Error('El mes ' + m + ' ya está cerrado. Reábralo si necesita rehacerlo.');
    }
    var f = calcularFacturacion_(m);
    if (f.sinTarifas || !f.fabricas.length) {
      throw new Error('No hay nada que cerrar en ' + m + ': ninguna fábrica facturó.');
    }
    var ahora = new Date();
    f.fabricas.forEach(function (g, i) {
      var l = g.liquidacion;
      agregarFila_('Cierres_Facturacion', {
        ID_Cierre: 'CIE-' + ahora.getTime() + '-' + i,
        Mes: m, ID_Fabrica: g.id, Estado_Cierre: 'CERRADO',
        Base: l.base,
        Porcentaje_AIU: l.pctAIU, Valor_AIU: l.valorAIU,
        Porcentaje_IVA: l.pctIVA, Valor_IVA: l.valorIVA,
        Total: l.total,
        Fecha_Cierre: ahora, Usuario_Cierre: ctx.correo || '',
        Nota: String(nota || '').trim()
      });
    });
    invalidarTabla_('Cierres_Facturacion');
    return { ok: true, mes: m, fabricas: f.fabricas.length,
             total: f.fabricas.reduce(function (a, g) { return a + g.liquidacion.total; }, 0) };
  });
}

/**
 * Reabre un mes cerrado. Solo el administrador.
 *
 * No borra el cierre: escribe el movimiento contrario. Lo que se pago queda en
 * la hoja aunque el mes vuelva a quedar abierto.
 *
 * @param {string} mes
 * @param {string=} nota Por que se reabre.
 * @return {!Object}
 */
function reabrirMesFacturacion(mes, nota) {
  var ctx = exigirAdministrador_();
  var m = mesDeFacturacion_(mes);

  return conBloqueo_(function () {
    var c = cierreDelMes_(m);
    if (!c.cerrado) throw new Error('El mes ' + m + ' no está cerrado.');
    var ahora = new Date();
    Object.keys(c.porFabrica).forEach(function (id, i) {
      var x = c.porFabrica[id];
      agregarFila_('Cierres_Facturacion', {
        ID_Cierre: 'CIE-' + ahora.getTime() + '-R' + i,
        Mes: m, ID_Fabrica: id, Estado_Cierre: 'REABIERTO',
        Base: x.base,
        Porcentaje_AIU: x.pctAIU, Valor_AIU: x.valorAIU,
        Porcentaje_IVA: x.pctIVA, Valor_IVA: x.valorIVA,
        Total: x.total,
        Fecha_Cierre: ahora, Usuario_Cierre: ctx.correo || '',
        Nota: String(nota || '').trim()
      });
    });
    invalidarTabla_('Cierres_Facturacion');
    return { ok: true, mes: m };
  });
}

/**
 * @param {string} mes
 * @return {!Object}
 * @private
 */
function calcularFacturacion_(mes) {
  /* Se calcula CON detalle porque el anexo de cada factura es el reparto por
     solicitud, y el reparto solo se arma cuando se pide el detalle. */
  var r = calcularCostos_(mes, mes, true);
  if (!r) throw new Error('El costeo no devolvió resultado.');
  if (r.sinTarifas) return { sinTarifas: true, mensaje: r.mensaje, mes: mes };

  var nombreFabrica = mapaFabricas();
  var datosFabrica = {};
  try {
    leerTabla_('Fabricas').forEach(function (f) { datosFabrica[f.ID_Fabrica] = f; });
  } catch (e) { /* la hoja se crea con actualizarEstructura */ }

  var porBolsa = {};
  (r.bolsas || []).forEach(function (b) { porBolsa[b.id] = b; });

  var porId = {};
  (r.actividades || []).forEach(function (a) { porId[a.id] = a; });

  /* Las bolsas que de verdad cobraron algo este mes. Una vigente pero sin cobro
     —vigencia que no alcanza un dia habil— no va en la factura. */
  var vigentes = (r.bolsas || []).filter(function (b) { return b.total > 0; });

  var grupos = {}, sinAsignar = [];
  vigentes.forEach(function (b) {
    if (b.sinFabrica) { sinAsignar.push(b); return; }
    grupos[b.fabrica] = grupos[b.fabrica] || {
      id: b.fabrica,
      nombre: nombreFabrica[b.fabrica] || b.fabrica,
      nit: (datosFabrica[b.fabrica] || {}).NIT || '',
      contrato: (datosFabrica[b.fabrica] || {}).Contrato || '',
      bolsas: [], aFacturar: 0, contratado: 0, sinAtribuir: 0,
      // El anexo se arma por iniciativa y por etapa, no como una lista plana.
      porIniciativa: {}, etapasVistas: {}, porEtapa: {}
    };
    var g = grupos[b.fabrica];
    g.bolsas.push(b);
    // El monto a facturar es lo ATRIBUIDO, por decision del usuario.
    g.aFacturar += b.atribuido;
    g.contratado += b.total;
    g.sinAtribuir += b.noAtribuido;
  });

  /* El anexo: una fila por SOLICITUD, con una columna por etapa, igual que la
     tabla de calculos detallados de la pagina de Costos. Sale del reparto —que
     trae una fila por bolsa y por solicitud— agregando por solicitud y etapa,
     asi que la suma del anexo es exactamente el monto a facturar: no se
     recalcula nada (D-133).

     CUIDADO con los dias: el reparto repite los MISMOS dias de la solicitud en
     esa etapa una vez por cada bolsa que cobra ahi. Sumarlos contaria doble
     cuando una etapa tiene dos bolsas de la misma fabrica —es el defecto que
     D-113 arreglo en el costo por dia—. Los dias se toman UNA vez por etapa; la
     plata si se suma, porque cada bolsa aporta la suya. */
  ((r.detalle || {}).reparto || []).forEach(function (x) {
    var b = porBolsa[x.bolsa];
    if (!b || b.sinFabrica || !grupos[b.fabrica]) return;
    var g = grupos[b.fabrica];
    var a = porId[x.id] || {};
    var idProy = a.idProyecto || 'SIN_INICIATIVA';

    g.porIniciativa[idProy] = g.porIniciativa[idProy] || {
      idProyecto: idProy, nombre: a.iniciativa || 'Sin iniciativa',
      costo: 0, porEtapa: {}, diasPorEtapa: {}, actividades: {}
    };
    var ini = g.porIniciativa[idProy];

    ini.actividades[x.id] = ini.actividades[x.id] || {
      id: x.id, nombre: a.nombre || x.id,
      tipo: a.tipo || '', tipoNombre: a.tipoNombre || '',
      // La misma plataforma que muestra la tabla de calculos detallados: el
      // anexo y esa tabla hablan de la misma plata, y se cotejan una contra otra.
      plataformaId: a.plataformaId || '', plataforma: a.plataforma || '',
      costo: 0, porEtapa: {}, diasPorEtapa: {}, rangos: a.rangos || {}
    };
    var act = ini.actividades[x.id];

    act.costo += x.costo;
    act.porEtapa[x.etapa] = (act.porEtapa[x.etapa] || 0) + x.costo;
    // Los dias NO se acumulan: se fijan una vez por etapa.
    act.diasPorEtapa[x.etapa] = x.dias;

    ini.costo += x.costo;
    ini.porEtapa[x.etapa] = (ini.porEtapa[x.etapa] || 0) + x.costo;

    g.etapasVistas[x.etapa] = b.etapaNombre;
    g.porEtapa[x.etapa] = (g.porEtapa[x.etapa] || 0) + x.costo;
  });

  var fabricas = Object.keys(grupos).map(function (k) { return grupos[k]; });
  fabricas.forEach(function (g) {
    // Dentro de cada factura, lo mas caro primero: es el orden en que alguien
    // revisa una cuenta antes de autorizarla.
    g.bolsas.sort(function (a, b) { return b.atribuido - a.atribuido; });

    /* Las columnas del anexo: solo las etapas donde ESTA fabrica cobro algo. Una
       columna vacia en un documento de pago invita a preguntar por que esta. Los
       dias de la columna se cuentan una sola vez por solicitud y etapa, por la
       misma razon de arriba. */
    g.etapas = ETAPAS_COSTO.filter(function (e) {
      return g.etapasVistas[e.id] !== undefined;
    }).map(function (e) {
      var dias = 0;
      Object.keys(g.porIniciativa).forEach(function (k) {
        var ini = g.porIniciativa[k];
        Object.keys(ini.actividades).forEach(function (id) {
          dias += ini.actividades[id].diasPorEtapa[e.id] || 0;
        });
      });
      return { etapa: e.id, nombre: e.nombre,
               costo: g.porEtapa[e.id] || 0, dias: red_(dias, 1) };
    });

    g.iniciativas = Object.keys(g.porIniciativa).map(function (k) {
      var ini = g.porIniciativa[k];
      var acts = Object.keys(ini.actividades).map(function (id) {
        var a = ini.actividades[id];
        a.costo = Math.round(a.costo);
        Object.keys(a.diasPorEtapa).forEach(function (e) {
          a.diasPorEtapa[e] = red_(a.diasPorEtapa[e], 1);
        });
        return a;
      }).sort(function (a, b) { return b.costo - a.costo; });
      // Los dias del subtotal de la iniciativa: suma de sus actividades, una vez
      // por etapa.
      var diasIni = {};
      acts.forEach(function (a) {
        Object.keys(a.diasPorEtapa).forEach(function (e) {
          diasIni[e] = red_((diasIni[e] || 0) + a.diasPorEtapa[e], 1);
        });
      });
      return { idProyecto: ini.idProyecto, nombre: ini.nombre,
               costo: Math.round(ini.costo), porEtapa: ini.porEtapa,
               diasPorEtapa: diasIni, actividades: acts };
    }).sort(function (a, b) { return b.costo - a.costo; });

    g.actividades = g.iniciativas.reduce(function (acc, i) {
      return acc + i.actividades.length;
    }, 0);

    /* La suma del anexo tiene que dar el monto a facturar. Si no cuadra es un
       error del calculo y el documento lo dice en vez de presentar una cuenta
       que no se sostiene: nadie deberia enterarse de esto en una reunion con el
       proveedor. */
    g.sumaAnexo = g.iniciativas.reduce(function (acc, i) { return acc + i.costo; }, 0);
    g.cuadra = g.sumaAnexo === g.aFacturar;

    /* La liquidacion: lo que de verdad se paga. La base no cambia —sigue siendo
       lo atribuido— y el AIU y el IVA se suman encima segun lo que tenga
       configurado ESTA fabrica. El anexo y los conceptos se quedan en la base:
       repartir el AIU entre las solicitudes romperia el amarre del anexo con la
       tabla de calculos detallados, que es lo que lo hace verificable. */
    g.liquidacion = liquidarFactura_(g.aFacturar, datosFabrica[g.id]);

    // Los mapas de trabajo no viajan: el navegador recibe ya las listas.
    delete g.porIniciativa;
    delete g.etapasVistas;
  });
  /* Se ordenan por el TOTAL que se paga, no por la base: con una fabrica que
     cobra AIU y otra que no, la mas cara por base puede no ser la mas cara a
     pagar, y el escogedor las muestra en este orden. */
  fabricas.sort(function (a, b) { return b.liquidacion.total - a.liquidacion.total; });

  /* El cierre del mes, si ya se hizo. Lo que manda entonces son las cifras
     congeladas; el recalculo sigue a la vista para poder compararlo. */
  var cierre = cierreDelMes_(mes);
  fabricas.forEach(function (g) {
    var c = cierre.porFabrica[g.id];
    if (!c) return;
    g.cerrado = true;
    g.cierre = c;
    /* Si despues de cerrar alguien corrigio fechas, la base recalculada ya no
       coincide con la que se pago. No se esconde ninguna de las dos: manda la
       congelada y el documento avisa de la diferencia. */
    g.difCierre = g.aFacturar - c.base;
    g.liquidacion = { base: c.base,
                      aplicaAIU: c.pctAIU > 0, pctAIU: c.pctAIU, valorAIU: c.valorAIU,
                      subtotal: c.base + c.valorAIU,
                      aplicaIVA: c.pctIVA > 0, pctIVA: c.pctIVA, valorIVA: c.valorIVA,
                      total: c.total };
  });

  return {
    mes: mes,
    moneda: r.moneda || 'COP',
    generado: Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA,
                                   CONFIG.FORMATO_FECHA_HORA),
    fabricas: fabricas,
    totalAFacturar: fabricas.reduce(function (a, g) { return a + g.aFacturar; }, 0),
    // El total que de verdad se desembolsa, con AIU e IVA de cada una.
    totalAPagar: fabricas.reduce(function (a, g) { return a + g.liquidacion.total; }, 0),
    totalContratado: fabricas.reduce(function (a, g) { return a + g.contratado; }, 0),
    cerrado: cierre.cerrado,
    cierre: cierre.cerrado ? { fecha: cierre.fecha, usuario: cierre.usuario,
                               nota: cierre.nota, fabricas: cierre.cuantas } : null,
    /* Las bolsas sin fabrica: nunca se suman a una factura. Si esta lista trae
       algo, hay plata que nadie va a cobrar porque no se sabe a quien pagarle. */
    sinAsignar: sinAsignar.map(function (b) {
      return { id: b.id, concepto: b.concepto, etapaNombre: b.etapaNombre,
               mensual: b.mensual, total: b.total, atribuido: b.atribuido };
    }),
    sinAsignarTotal: sinAsignar.reduce(function (a, b) { return a + b.atribuido; }, 0),
    // Lo que falta por diligenciar cambia el monto a facturar: se dice.
    actividadesSinFechas: r.incompletasTotal || 0
  };
}
