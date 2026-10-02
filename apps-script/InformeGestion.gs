/**
 * InformeGestion.gs | El informe de gestion del mes, para el comite.
 *
 * El archivo NO puede llamarse Informe.gs: Apps Script ignora la extension, y
 * Informe.gs con Informe.html serian dos archivos con el mismo nombre. Eso ya
 * nos costo un despliegue que reporto exito sin subir nada (D-111).
 *
 * Esta pagina no calcula casi nada nuevo: arma, con el mes como eje, lo que ya
 * miden Metricas.gs y Costeo.gs. Las decisiones que SI son propias de aqui:
 *
 *  1. Las duraciones salen de las COLUMNAS de fecha de la solicitud, no de la
 *     bitacora. La herramienta se empezo a usar en septiembre y la bitacora solo
 *     ve lo que paso dentro de ella; las columnas las esta diligenciando el
 *     equipo hacia atras. Es la misma fuente que usa el costeo (D-114).
 *  2. Los bloqueos SI salen de la bitacora, porque son lo unico que no tiene
 *     columnas: el bloqueo es un estado, y la bitacora guarda cuando se entro y
 *     cuando se salio. Lo que no guarda es el motivo (al desbloquear se borra la
 *     causal), y el informe lo dice en lugar de callarlo.
 *  3. Los costos viajan como PORCENTAJES y COSTOS UNITARIOS. El valor de cada
 *     bolsa no sale del servidor: es informacion de contrato y esta presentacion
 *     va a presidencia. No es que la pantalla lo esconda —no lo recibe.
 *  4. Todo indicador viaja con su COBERTURA: cuantas solicitudes tenian la
 *     informacion que el indicador necesita. Un promedio calculado sobre tres de
 *     cuarenta solicitudes no es un promedio, es una anecdota, y el comite tiene
 *     derecho a saber cual de las dos esta viendo (D-127).
 */

/* Tope del detalle que viaja al navegador. El informe muestra listas por
   version y por plataforma; un mes con cientos de solicitudes no debe reventar
   la pagina. */
var INFORME_TOPE_DETALLE = 300;

/* Las fases que tienen columnas de inicio y fin en la solicitud. Aceptacion TI
   (FAS-07) y Produccion (FAS-08) no las tienen: no se pueden medir con esta
   fuente y el informe lo declara en vez de mostrar un cero. */
var INFORME_FASES_CON_FECHAS = [
  { fase: 'FAS-01', ini: 'Fecha_Inicio_Demanda', fin: 'Fecha_Fin_Demanda', no: '' },
  { fase: 'FAS-02', ini: 'Fecha_Inicio_Backlog', fin: 'Fecha_Fin_Backlog', no: '' },
  { fase: 'FAS-03', ini: 'Fecha_Inicio_Analisis', fin: 'Fecha_Fin_Analisis', no: 'No_Aplica_Analisis' },
  { fase: 'FAS-04', ini: 'Fecha_Inicio_Dev', fin: 'Fecha_Fin_Dev', no: 'No_Aplica_Dev' },
  { fase: 'FAS-05', ini: 'Fecha_Inicio_QA', fin: 'Fecha_Fin_QA', no: 'No_Aplica_QA' },
  { fase: 'FAS-06', ini: 'Fecha_Inicio_UAT', fin: 'Fecha_Fin_UAT', no: 'No_Aplica_UAT' }
];

/* El estado "Bloqueada" del catalogo. El bloqueo de una solicitud es su estado:
   mover la tarjeta a Bloqueada y que la marca dijera otra cosa serian dos
   verdades para lo mismo (Codigo.gs). */
var INFORME_ESTADO_BLOQUEADA = 'EST-04';

/**
 * El informe de gestion de un mes.
 *
 * @param {string} mes 'yyyy-MM'. Vacio significa el mes en curso.
 * @param {boolean=} forzar Relee las hojas antes de calcular.
 * @return {!Object}
 */
function getInforme(mes, forzar) {
  exigirPagina_('informe');
  var m = informeMesValido_(mes);

  /* Igual que en Costos: lo que alguien corrige A MANO en el Sheets no mueve los
     sellos, asi que el boton de recargar tiene que releer de verdad. Sin esto se
     corrige una fecha en la hoja, se vuelve al informe y sale igual que antes
     (D-120). */
  if (forzar) {
    ['Solicitudes', 'Proyectos', 'Roadmap_Versiones', 'Auditoria_Transiciones',
     'SLA_Fases', 'Costos_Fabrica'].forEach(function (t) {
      try { invalidarTabla_(t); } catch (e) { /* una hoja que no esta no estorba */ }
    });
    return planoParaElNavegador_(calcularInforme_(m));
  }

  return conResultadoEnCache_('informe_' + m, function () {
    return planoParaElNavegador_(calcularInforme_(m));
  }, versionDatos_());
}

/**
 * Normaliza el mes pedido. Un mes invalido se cambia por el actual en lugar de
 * reventar: la pagina lo manda desde un control de fecha del navegador y un
 * navegador viejo puede mandar vacio.
 * @param {*} mes
 * @return {string} 'yyyy-MM'
 * @private
 */
function informeMesValido_(mes) {
  var m = String(mes || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM');
}

/** @return {string} El mes anterior a uno dado. @private */
function informeMesAnterior_(mes) {
  var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  var f = new Date(a, m - 2, 1);
  return f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2);
}

/** @return {boolean} Si la fecha cae dentro del mes. @private */
function informeEnElMes_(fecha, lim) {
  return !!fecha && fecha >= lim.inicio && fecha <= lim.fin;
}

/**
 * Reparte un porcentaje sobre un total, o null si no hay total.
 * Se separa porque el informe lo hace en siete sitios y un `|| 0` de mas
 * convierte "no se puede calcular" en "cero", que no es lo mismo.
 * @private
 */
function informePct_(parte, total) {
  return total ? red_(parte * 100 / total, 1) : null;
}

/* ================================================================== */
/* 1. Iniciativas: volumen y estado, agrupadas por plataforma          */
/* ================================================================== */

/**
 * El volumen de iniciativas y su estado, por Plataforma Digital.
 *
 * La iniciativa TIENE un campo de plataforma y esta vacio en todas (pendiente
 * S-15). Asi que la plataforma se DEDUCE de las plataformas de sus solicitudes,
 * que si es un campo obligatorio. Deducir no es decidir, y por eso el resultado
 * dice de donde salio cada agrupacion: declarada, deducida, varias o ninguna.
 * Sin eso, el comite leeria como un dato de maestro algo que es una inferencia.
 *
 * @param {!Object} datos
 * @return {!Object}
 * @private
 */

function informeIniciativasPorPlataforma_(datos) {
  var nombrePlataforma = mapaPlataformas();
  var nombreEstado = mapaEstadosIniciativa();
  var plataformaDe = plataformaDeIniciativas_(datos);
  var origen = plataformaDe.origen;

  var porPlataforma = {}, sinPlataforma = [], enVarias = [];

  datos.proyectos.forEach(function (p) {
    var d = plataformaDe.de[p.ID_Proyecto] || { plat: '', como: 'ninguna', tocadas: [] };
    var plat = d.plat, como = d.como, tocadas = d.tocadas;

    var ficha = { id: p.ID_Proyecto, nombre: p.Nombre_Proyecto || p.ID_Proyecto,
                  estado: p.Estado_Iniciativa || '',
                  estadoNombre: nombreEstado[p.Estado_Iniciativa] || 'Sin estado',
                  origenPlataforma: como,
                  plataformas: tocadas.map(function (k) {
                    return nombrePlataforma[k] || k;
                  }) };

    if (como === 'varias') enVarias.push(ficha);
    else if (como === 'ninguna') sinPlataforma.push(ficha);

    // Una iniciativa que toca varias plataformas se cuenta en TODAS: el comite
    // pregunta "que hay en Banca Movil", y esconderla porque tambien toca otra
    // plataforma seria responder mal. El total de la tabla, por eso, puede
    // superar el numero de iniciativas, y el informe lo advierte.
    var destinos = (como === 'varias') ? tocadas : (plat ? [plat] : ['SIN_PLATAFORMA']);
    destinos.forEach(function (k) {
      porPlataforma[k] = porPlataforma[k] || { id: k, nombre: nombrePlataforma[k] || 'Sin plataforma',
                                               total: 0, estados: {}, iniciativas: [] };
      porPlataforma[k].total++;
      porPlataforma[k].estados[ficha.estado || 'SIN_ESTADO'] =
        (porPlataforma[k].estados[ficha.estado || 'SIN_ESTADO'] || 0) + 1;
      porPlataforma[k].iniciativas.push(ficha);
    });
  });

  var lista = Object.keys(porPlataforma).map(function (k) { return porPlataforma[k]; })
      .sort(function (a, b) { return b.total - a.total; });

  return {
    total: datos.proyectos.length,
    // Suma de las filas: distinta del total cuando una iniciativa toca varias
    // plataformas. Se manda calculada para que la pantalla no tenga que
    // explicar una resta que el servidor ya sabe hacer.
    sumaFilas: lista.reduce(function (a, x) { return a + x.total; }, 0),
    porPlataforma: lista,
    estados: ESTADOS_INICIATIVA,
    origen: origen,
    sinPlataforma: sinPlataforma,
    enVarias: enVarias
  };
}


/* ================================================================== */
/* 2 y 3. Versiones entregadas y planeadas                             */
/* ================================================================== */

/**
 * Las versiones del mes: lo que salio a produccion y lo que estaba planeado.
 *
 * Las solicitudes de una version se amarran por numero de version y plataforma,
 * que es como las amarra el Roadmap. El formulario ofrece la version de una
 * lista y el servidor rechaza una que no exista, asi que el amarre es firme
 * salvo por una puerta: la carga masiva escribia el numero sin validarlo. Se
 * cerro en D-127, y el informe igual lleva una bolsa de "entregado sin version
 * reconocida" para que una solicitud nunca desaparezca en silencio.
 *
 * @param {!Object} datos
 * @param {!Object} lim Limites del mes.
 * @return {!Object}
 * @private
 */
function informeVersiones_(datos, lim) {
  var nombrePlataforma = mapaPlataformas();
  var nombreTipo = mapaCatalogo_(getTiposSolicitud_());
  var deFabrica = datos.solicitudesFabrica;

  // plataforma|numero -> true, para detectar lo entregado sin version valida.
  var versionConocida = {};
  datos.roadmap.forEach(function (v) {
    if (!v.Numero_Version) return;
    versionConocida[(v.Plataforma_ID || '') + '|' + v.Numero_Version] = true;
  });

  function solicitudesDe(v) {
    var idPlat = v.Plataforma_ID || '';
    return deFabrica.filter(function (s) {
      return s.Version_Semantica === v.Numero_Version && (s.Plataforma_ID || '') === idPlat;
    }).concat(datos.estabilizaciones.filter(function (s) {
      return String(s.Version_Correccion || '') === String(v.ID_Version);
    })).map(function (s) {
      return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
               tipo: s.Tipo_Solicitud || '',
               tipoNombre: nombreTipo[s.Tipo_Solicitud] || s.Tipo_Solicitud || 'Sin tipo',
               iniciativa: s.ID_Proyecto || '',
               enProduccion: llegoAProduccion_(s) };
    });
  }

  var entregadas = [], planeadasDelMes = [], planeadasFuturas = [];

  datos.roadmap.forEach(function (v) {
    var real = aFecha_(v.Fecha_Despliegue_Real), plan = aFecha_(v.Fecha_Planeada);
    var suyas = solicitudesDe(v);
    var ficha = {
      idVersion: v.ID_Version, numero: v.Numero_Version,
      plataformaId: v.Plataforma_ID || '',
      plataforma: nombrePlataforma[v.Plataforma_ID] || v.Plataforma_ID || 'Sin plataforma',
      estadoRelease: v.Estado_Release || '',
      fechaPlaneada: v.Fecha_Planeada || null,
      fechaReal: v.Fecha_Despliegue_Real || null,
      // En dias CALENDARIO: a un comite se le informa que una entrega se corrio
      // doce dias, no nueve dias habiles.
      desvioDias: (plan && real) ? Math.round((real.getTime() - plan.getTime()) / MS_DIA) : null,
      solicitudes: suyas,
      cuenta: suyas.length,
      porTipo: contarPor_(suyas, function (s) { return s.tipo; })
    };

    if (informeEnElMes_(real, lim)) { entregadas.push(ficha); return; }
    // Planeada para el mes y sin despliegue real: es lo que NO se entrego.
    if (!real && informeEnElMes_(plan, lim)) { planeadasDelMes.push(ficha); return; }
    if (!real && plan && plan > lim.fin) { planeadasFuturas.push(ficha); }
  });

  function porPlat(lista) {
    var g = {};
    lista.forEach(function (v) {
      g[v.plataformaId] = g[v.plataformaId] ||
        { id: v.plataformaId, nombre: v.plataforma, versiones: [], solicitudes: 0 };
      g[v.plataformaId].versiones.push(v);
      g[v.plataformaId].solicitudes += v.cuenta;
    });
    return Object.keys(g).map(function (k) { return g[k]; })
        .sort(function (a, b) { return b.solicitudes - a.solicitudes; });
  }

  /* La red de seguridad: lo que llego a produccion en el mes y cuya version no
     existe en el Roadmap. Si esta lista trae algo, la suma de las versiones no
     cuadra con lo entregado, y es mejor verlo aqui que descubrirlo en el
     comite. */
  var huerfanas = deFabrica.filter(function (s) {
    if (!informeEnElMes_(aFecha_(s.Fecha_Despliegue), lim)) return false;
    var v = String(s.Version_Semantica || '').trim();
    if (!v) return true;
    return !versionConocida[(s.Plataforma_ID || '') + '|' + v];
  }).map(function (s) {
    return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
             plataforma: nombrePlataforma[s.Plataforma_ID] || s.Plataforma_ID || 'Sin plataforma',
             version: s.Version_Semantica || '' };
  });

  var ordenar = function (a, b) {
    return String(a.fechaReal || a.fechaPlaneada || '')
        .localeCompare(String(b.fechaReal || b.fechaPlaneada || ''));
  };
  entregadas.sort(ordenar); planeadasDelMes.sort(ordenar); planeadasFuturas.sort(ordenar);

  var aTiempo = entregadas.filter(function (v) {
    return v.desvioDias !== null && v.desvioDias <= 0;
  }).length;
  var conFecha = entregadas.filter(function (v) { return v.desvioDias !== null; }).length;

  return {
    entregadas: entregadas,
    entregadasPorPlataforma: porPlat(entregadas),
    planeadasDelMes: planeadasDelMes,
    planeadasFuturas: planeadasFuturas.slice(0, INFORME_TOPE_DETALLE),
    solicitudesEntregadas: entregadas.reduce(function (a, v) { return a + v.cuenta; }, 0),
    puntualidad: {
      aTiempo: aTiempo, conFechaPlaneada: conFecha,
      sinFechaPlaneada: entregadas.length - conFecha,
      pct: informePct_(aTiempo, conFecha)
    },
    sinVersionReconocida: huerfanas,
    tipos: getTiposSolicitud_()
  };
}

/* ================================================================== */
/* 4. El embudo: cuantas solicitudes hay en cada fase del ciclo        */
/* ================================================================== */

/**
 * El inventario del ciclo de fabrica: cuantas solicitudes hay en cada fase.
 *
 * Es una foto al momento de consultar, no al cierre del mes: reconstruir el
 * inventario historico exigiria rehacer el estado de cada solicitud dia por dia
 * desde la bitacora, y la bitacora no cubre lo anterior a la herramienta. El
 * informe lo dice en la pantalla para que nadie lea "al 30 de septiembre".
 *
 * Lo que SI es del mes son las entradas y las salidas, que salen de la bitacora.
 *
 * @param {!Object} datos
 * @param {!Object} lim
 * @return {!Object}
 * @private
 */
function informeEmbudo_(datos, lim) {
  var enFase = {}, bloqueadasEnFase = {};
  datos.solicitudesFabrica.forEach(function (s) {
    var f = s.Fase_Actual || 'SIN_FASE';
    enFase[f] = (enFase[f] || 0) + 1;
    if (String(s.Estado_Actual) === INFORME_ESTADO_BLOQUEADA) {
      bloqueadasEnFase[f] = (bloqueadasEnFase[f] || 0) + 1;
    }
  });

  var entradasMes = {}, salidasMes = {};
  datos.auditoria.forEach(function (a) {
    if (!informeEnElMes_(aFecha_(a.Fecha_Hora_Cambio), lim)) return;
    if (a.Fase_Destino) entradasMes[a.Fase_Destino] = (entradasMes[a.Fase_Destino] || 0) + 1;
    if (a.Fase_Origen) salidasMes[a.Fase_Origen] = (salidasMes[a.Fase_Origen] || 0) + 1;
  });

  var fases = FASES.map(function (f) {
    return { fase: f.id, nombre: f.nombre, orden: f.orden,
             enFase: enFase[f.id] || 0,
             bloqueadas: bloqueadasEnFase[f.id] || 0,
             entradas: entradasMes[f.id] || 0,
             salidas: salidasMes[f.id] || 0 };
  });

  return {
    fases: fases,
    sinFase: enFase['SIN_FASE'] || 0,
    totalEnVuelo: FASES_EN_VUELO.reduce(function (a, f) { return a + (enFase[f] || 0); }, 0),
    enProduccion: enFase['FAS-08'] || 0,
    // Entraron al embudo y salieron de el durante el mes: la capacidad de
    // entrada y de salida, que es lo que dice si el inventario crece.
    entraronAlEmbudo: entradasMes['FAS-01'] || 0,
    llegaronAProduccion: entradasMes['FAS-08'] || 0,
    tareas: datos.tareas.length,
    estabilizaciones: datos.estabilizaciones.length
  };
}

/* ================================================================== */
/* 5. Bloqueos del mes                                                 */
/* ================================================================== */

/**
 * Los bloqueos del mes, reconstruidos de la bitacora.
 *
 * Es el unico indicador del informe que NO sale de las columnas, porque el
 * bloqueo no tiene columnas: es un estado. La bitacora guarda la entrada y la
 * salida de "Bloqueada", y de ahi salen cuantos hubo y cuanto duraron.
 *
 * Lo que la bitacora no guarda es el MOTIVO: al levantar un bloqueo el sistema
 * borra la causal y la observacion de la solicitud. Asi que de los bloqueos ya
 * resueltos se sabe cuando y cuanto, no por que. El informe devuelve
 * `causalPerdida` contandolos, porque un comite que ve "7 bloqueos, 23 dias
 * habiles perdidos" va a preguntar por que, y la respuesta honesta hoy es que no
 * quedo registrado (D-127).
 *
 * @param {!Object} datos
 * @param {!Object} lim
 * @return {!Object}
 * @private
 */
function informeBloqueos_(datos, lim) {
  var nombreCausal = mapaCatalogo_(getCausalesBloqueo_());
  var porId = {};
  datos.solicitudes.forEach(function (s) { porId[s.ID_Solicitud] = s; });

  // La bitacora en orden cronologico: para emparejar cada entrada con su salida
  // hay que recorrerla hacia adelante.
  var orden = datos.auditoria.slice().filter(function (a) {
    return !!aFecha_(a.Fecha_Hora_Cambio);
  }).sort(function (a, b) {
    return aFecha_(a.Fecha_Hora_Cambio) - aFecha_(b.Fecha_Hora_Cambio);
  });

  var abierto = {};        // solicitud -> fecha de entrada al bloqueo
  var episodios = [];

  orden.forEach(function (a) {
    var f = aFecha_(a.Fecha_Hora_Cambio);
    var id = a.ID_Solicitud;
    var entra = String(a.Estado_Destino) === INFORME_ESTADO_BLOQUEADA;
    var sale = String(a.Estado_Origen) === INFORME_ESTADO_BLOQUEADA && !entra;

    if (entra && !abierto[id]) { abierto[id] = f; return; }
    if (sale && abierto[id]) {
      episodios.push({ id: id, desde: abierto[id], hasta: f, abierto: false });
      delete abierto[id];
    }
  });

  // Los que no se cerraron: siguen bloqueados hoy.
  Object.keys(abierto).forEach(function (id) {
    episodios.push({ id: id, desde: abierto[id], hasta: null, abierto: true });
  });

  /* Un episodio cuenta en el mes si lo TOCA, no solo si empezo en el: un
     bloqueo que arranco en agosto y se levanto el 10 de septiembre es un
     bloqueo de septiembre para quien mira el mes. Los dias que se informan son
     los del mes consultado, igual que en el costeo. */
  var delMes = episodios.filter(function (e) {
    var hasta = e.hasta || lim.fin;
    return hasta >= lim.inicio && e.desde <= lim.fin;
  }).map(function (e) {
    var s = porId[e.id] || {};
    var desde = e.desde > lim.inicio ? e.desde : lim.inicio;
    var hasta = (e.hasta && finDelDia_(e.hasta) < lim.fin) ? finDelDia_(e.hasta) : lim.fin;
    var causal = String(s.Causal_Bloqueo || '').trim();
    return {
      id: e.id, nombre: s.Nombre_Solicitud || e.id,
      iniciativa: s.ID_Proyecto || '',
      plataforma: s.Plataforma_ID || '',
      fase: s.Fase_Actual || '',
      desde: e.desde, hasta: e.hasta,
      sigueAbierto: e.abierto,
      diasHabiles: red_(diasHabilesEntre(desde, hasta) || 0, 1),
      causal: causal,
      // La causal solo sobrevive mientras el bloqueo esta abierto. En uno ya
      // resuelto, vacia no significa "sin causa": significa que se borro.
      causalNombre: causal ? (nombreCausal[causal] || causal)
                           : (e.abierto ? 'Sin causal registrada' : 'No quedo registrada'),
      causalPerdida: !causal && !e.abierto
    };
  }).sort(function (a, b) { return b.diasHabiles - a.diasHabiles; });

  var abiertos = delMes.filter(function (e) { return e.sigueAbierto; });
  var porCausal = {};
  delMes.forEach(function (e) {
    var k = e.causal || (e.sigueAbierto ? 'SIN_CAUSAL' : 'NO_REGISTRADA');
    porCausal[k] = porCausal[k] || { causal: k, nombre: e.causalNombre, cuenta: 0, dias: 0 };
    porCausal[k].cuenta++;
    porCausal[k].dias = red_(porCausal[k].dias + e.diasHabiles, 1);
  });

  return {
    episodios: delMes.slice(0, INFORME_TOPE_DETALLE),
    episodiosTotal: delMes.length,
    sigueAbiertos: abiertos.length,
    diasHabilesPerdidos: red_(delMes.reduce(function (a, e) { return a + e.diasHabiles; }, 0), 1),
    promedioDias: delMes.length
      ? red_(delMes.reduce(function (a, e) { return a + e.diasHabiles; }, 0) / delMes.length, 1)
      : null,
    causalPerdida: delMes.filter(function (e) { return e.causalPerdida; }).length,
    porCausal: Object.keys(porCausal).map(function (k) { return porCausal[k]; })
        .sort(function (a, b) { return b.dias - a.dias; }),
    // Si la bitacora esta vacia, "cero bloqueos" no es una buena noticia: es que
    // no hay con que medirlos.
    sinBitacora: datos.auditoria.length === 0
  };
}

/* ================================================================== */
/* 6. Cycle Time por fase contra SLA                                   */
/* ================================================================== */

/**
 * Cuanto duro cada fase, contra su SLA.
 *
 * Se mide sobre las fases que CERRARON en el mes —las que tienen fecha de fin
 * dentro del mes consultado—, porque una fase que sigue abierta no tiene
 * duracion todavia, y meterla a medias bajaria todos los promedios.
 *
 * La fuente son las COLUMNAS de la solicitud, por instruccion expresa: la
 * bitacora solo ve lo que paso dentro de la herramienta, y el equipo esta
 * diligenciando las columnas hacia atras (D-114).
 *
 * Se informa la MEDIANA junto al promedio: basta una solicitud olvidada un mes
 * en una fase para que el promedio deje de describir a las demas.
 *
 * Los SLA de hoy son los valores sugeridos que se sembraron al instalar y que
 * nadie ha aprobado, asi que viajan marcados como provisionales y la pantalla lo
 * dice. Presentar a un comite un cumplimiento contra una meta que nadie acordo
 * es hacerle creer que la meta existe (D-127).
 *
 * @param {!Object} datos
 * @param {!Object} lim
 * @return {!Object}
 * @private
 */
function informeCicloPorFase_(datos, lim) {
  var sla = mapaSla_(datos.sla);
  var nombreFase = mapaCatalogo_(FASES);
  var deFabrica = datos.solicitudesFabrica;

  var filas = INFORME_FASES_CON_FECHAS.map(function (def) {
    var duraciones = [], fuera = 0, noAplica = 0, abiertas = 0, sinFechas = 0;
    var detalle = [];

    deFabrica.forEach(function (s) {
      if (def.no && esSi_(s[def.no])) { noAplica++; return; }
      var ini = aFecha_(s[def.ini]), fin = aFecha_(s[def.fin]);
      if (!ini && !fin) { sinFechas++; return; }
      if (ini && !fin) { abiertas++; return; }
      if (!informeEnElMes_(fin, lim)) return;      // cerro en otro mes
      if (!ini) { sinFechas++; return; }

      /* La fecha de fin se extiende al final del dia, igual que en el costeo.
         Una columna de fecha sin hora llega como medianoche, y medir
         "1 al 10 de septiembre" de medianoche a medianoche da 7 dias habiles en
         vez de 8: el ultimo dia no cuenta. El costeo ya lo corrige con
         finDelDia_, asi que sin esto el informe diria 7 dias donde el costo
         cobra 8, y serian dos cifras distintas para la misma estadia en la misma
         presentacion (D-127). */
      var dias = red_(diasHabilesEntre(ini, finDelDia_(fin)) || 0, 1);
      duraciones.push(dias);
      var meta = sla[def.fase];
      if (meta && dias > meta) fuera++;
      detalle.push({ id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
                     dias: dias, dentroSla: meta ? dias <= meta : null });
    });

    var meta = sla[def.fase] || null;
    return {
      fase: def.fase, nombre: nombreFase[def.fase] || def.fase,
      cerradas: duraciones.length,
      promedio: duraciones.length ? red_(promedio_(duraciones), 1) : null,
      mediana: duraciones.length ? red_(mediana_(duraciones), 1) : null,
      p85: duraciones.length ? red_(percentil85_(duraciones), 1) : null,
      sla: meta,
      fueraDeSla: fuera,
      cumplimientoPct: duraciones.length ? informePct_(duraciones.length - fuera, duraciones.length) : null,
      // La cobertura: sin esto, "promedio 4 dias" calculado sobre dos
      // solicitudes de cuarenta se lee igual que uno calculado sobre las
      // cuarenta.
      enCurso: abiertas, sinFechas: sinFechas, noAplica: noAplica,
      detalle: detalle.sort(function (a, b) { return b.dias - a.dias; })
          .slice(0, INFORME_TOPE_DETALLE)
    };
  });

  // Las dos fases que no tienen columnas de fecha. Se declaran para que su
  // ausencia sea una decision visible y no un olvido.
  var sinColumnas = FASES.filter(function (f) {
    return !INFORME_FASES_CON_FECHAS.some(function (d) { return d.fase === f.id; });
  }).map(function (f) { return { fase: f.id, nombre: f.nombre, sla: sla[f.id] || null }; });

  return {
    fases: filas,
    sinColumnas: sinColumnas,
    // Los SLA de arranque nunca se aprobaron: el pendiente S-09/S-19 sigue
    // abierto. Mientras siga abierto, el informe los rotula.
    slaProvisional: true,
    totalFabrica: deFabrica.length
  };
}

/* ================================================================== */
/* 7. Distribucion por plataforma                                      */
/* ================================================================== */

/**
 * Como se reparte el trabajo del mes entre las plataformas.
 *
 * Cuenta tres cosas distintas y las muestra juntas, porque separadas enganan:
 * lo que hay EN VUELO (inventario), lo que se ENTREGO en el mes (salida) y lo
 * que se REGISTRO en el mes (demanda nueva). Una plataforma puede tener mucho
 * inventario y ninguna entrega, y es justo lo que hay que ver.
 *
 * @param {!Object} datos
 * @param {!Object} lim
 * @return {!Object}
 * @private
 */
function informeDistribucionPlataforma_(datos, lim) {
  var nombrePlataforma = mapaPlataformas();
  var nombreTipo = mapaCatalogo_(getTiposSolicitud_());
  var g = {};

  function fila(k) {
    g[k] = g[k] || { id: k, nombre: nombrePlataforma[k] || 'Sin plataforma',
                     enVuelo: 0, entregadas: 0, registradas: 0,
                     bloqueadas: 0, enProduccionSinFecha: 0, tipos: {} };
    return g[k];
  }

  datos.solicitudes.forEach(function (s) {
    var k = String(s.Plataforma_ID || '').trim() || 'SIN_PLATAFORMA';
    var f = fila(k);
    if (FASES_EN_VUELO.indexOf(s.Fase_Actual) !== -1) f.enVuelo++;
    if (String(s.Estado_Actual) === INFORME_ESTADO_BLOQUEADA) f.bloqueadas++;
    if (informeEnElMes_(aFecha_(s.Fecha_Registro), lim)) f.registradas++;
    /* Entregada EN EL MES significa que llego a produccion y que su fecha de
       despliegue cae en el mes. Una solicitud en produccion sin fecha de
       despliegue no se puede atribuir a ningun mes: no se cuenta aqui y se
       informa aparte, porque contarla en el mes consultado inflaria el mes que
       alguien este mirando, cualquiera que sea. */
    if (llegoAProduccion_(s)) {
      if (informeEnElMes_(aFecha_(s.Fecha_Despliegue), lim)) {
        f.entregadas++;
        f.tipos[s.Tipo_Solicitud] = (f.tipos[s.Tipo_Solicitud] || 0) + 1;
      } else if (!aFecha_(s.Fecha_Despliegue)) {
        f.enProduccionSinFecha++;
      }
    }
  });

  var lista = Object.keys(g).map(function (k) { return g[k]; });
  var totEnVuelo = lista.reduce(function (a, x) { return a + x.enVuelo; }, 0);
  var totEntregadas = lista.reduce(function (a, x) { return a + x.entregadas; }, 0);
  var totRegistradas = lista.reduce(function (a, x) { return a + x.registradas; }, 0);

  lista.forEach(function (x) {
    x.pctEnVuelo = informePct_(x.enVuelo, totEnVuelo);
    x.pctEntregadas = informePct_(x.entregadas, totEntregadas);
    x.pctRegistradas = informePct_(x.registradas, totRegistradas);
  });

  return {
    plataformas: lista.sort(function (a, b) {
      return (b.entregadas - a.entregadas) || (b.enVuelo - a.enVuelo);
    }),
    totales: { enVuelo: totEnVuelo, entregadas: totEntregadas, registradas: totRegistradas,
               enProduccionSinFecha: lista.reduce(function (a, x) {
                 return a + x.enProduccionSinFecha; }, 0) },
    tipos: getTiposSolicitud_(),
    nombreTipo: nombreTipo
  };
}

/* ================================================================== */
/* 8 y 9. Mezcla de inversion e indicadores de costo                   */
/* ================================================================== */

/**
 * Donde se concentro el valor entregado, y los costos relevantes del mes.
 *
 * ESTA FUNCION NO DEVUELVE EL VALOR DE NINGUNA BOLSA, ni el total facturado del
 * mes. Devuelve porcentajes y costos unitarios. No es que la pantalla los
 * esconda: el servidor no los manda, porque la presentacion va a presidencia y
 * el valor del contrato con la fabrica no es lo que se esta presentando.
 *
 * Advertencia honesta, que tambien va a la pantalla: un costo unitario
 * multiplicado por el numero de entregas aproxima el total atribuido. Quien
 * quiera cerrar tambien esa puerta tiene que renunciar al costo unitario, y el
 * costo unitario es el numero mas util del bloque.
 *
 * @param {string} mes
 * @param {!Object} datos
 * @return {!Object}
 * @private
 */
function informeCostos_(mes, datos) {
  var c;
  try {
    c = calcularCostos_(mes, mes);
  } catch (e) {
    return { disponible: false, motivo: String(e && e.message || e) };
  }
  if (!c) return { disponible: false, motivo: 'El costeo no devolvio resultado.' };
  if (c.sinTarifas) return { disponible: false, motivo: c.mensaje || 'Faltan las tarifas de fabrica.' };

  var contrato = c.total.contrato || 0;
  if (!contrato) {
    return { disponible: false,
             motivo: 'No hay capacidad vigente con valor en ' + mes + '.' };
  }

  var porProy = {};
  datos.proyectos.forEach(function (p) { porProy[p.ID_Proyecto] = p; });
  var nombreLen = mapaLineasEstrategicas();
  var nombreVert = mapaVerticales();
  var nombreTipoIni = mapaCatalogo_(getTiposIniciativa_());
  var nombreTipo = mapaCatalogo_(getTiposSolicitud_());

  /* La mezcla: se agrupa el costo atribuido por el eje pedido y se convierte a
     porcentaje contra el TOTAL ATRIBUIDO, no contra el facturado. Si se midiera
     contra el facturado, la suma de la mezcla no daria 100 y la diferencia —la
     capacidad sin atribuir— se leeria como un error de la tabla. Esa cifra se
     informa aparte, que es donde significa algo. */
  function mezclaPor(campo, nombres, etiquetaVacio) {
    var g = {};
    c.porIniciativa.forEach(function (i) {
      var p = porProy[i.idProyecto] || {};
      var k = String(p[campo] || '').trim() || 'SIN_DATO';
      g[k] = g[k] || { id: k, nombre: k === 'SIN_DATO' ? etiquetaVacio : (nombres[k] || k),
                       costo: 0, iniciativas: 0, actividades: 0 };
      g[k].costo += i.costo;
      g[k].iniciativas++;
      g[k].actividades += i.actividades || 0;
    });
    var total = Object.keys(g).reduce(function (a, k) { return a + g[k].costo; }, 0);
    return Object.keys(g).map(function (k) {
      var x = g[k];
      return { id: x.id, nombre: x.nombre, iniciativas: x.iniciativas,
               actividades: x.actividades, pct: informePct_(x.costo, total) };
    }).sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });
  }

  /* Construir contra corregir: de todo lo que costo el mes, cuanto se fue en
     cosas nuevas y mejoras y cuanto en arreglar lo que ya estaba. Es la lectura
     que un comite usa para decidir, y la que justifica invertir en calidad. */
  var construir = 0, corregir = 0, otros = 0;
  var porTipoPct = (c.porTipo || []).map(function (t) {
    if (esTipoEstabilizacion(t.tipo)) corregir += t.costo;
    else if (t.tipo === 'TIP-01' || t.tipo === 'TIP-02' || t.tipo === 'TIP-03') construir += t.costo;
    else otros += t.costo;
    return { tipo: t.tipo, nombre: nombreTipo[t.tipo] || t.tipo,
             actividades: t.actividades, pct: informePct_(t.costo, c.total.atribuido) };
  }).sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });

  // Costos unitarios: los unicos valores absolutos del bloque.
  var entregadas = datos.solicitudesFabrica.concat(datos.estabilizaciones)
      .filter(llegoAProduccion_).length;

  return {
    disponible: true,
    mes: mes,
    moneda: c.moneda || 'COP',
    // Trazabilidad de la capacidad: que parte de lo pagado encontro a que
    // actividad cargarse. Lo que no, es capacidad pagada sin trazabilidad.
    pctAtribuido: c.total.pctAtribuido,
    pctSinAtribuir: informePct_(c.total.noAtribuido, contrato),
    actividadesCosteadas: c.total.actividades,
    bolsasParciales: (c.bolsas || []).filter(function (b) { return b.parcial; }).length,
    bolsasVigentes: (c.bolsas || []).filter(function (b) { return b.meses > 0; }).length,
    porLinea: mezclaPor('LEN_ID', nombreLen, 'Sin linea estrategica'),
    porVertical: mezclaPor('Vertical_ID', nombreVert, 'Sin vertical'),
    porTipoIniciativa: mezclaPor('Tipo_Iniciativa', nombreTipoIni, 'Sin tipo'),
    porTipoSolicitud: porTipoPct,
    construirVsCorregir: {
      construirPct: informePct_(construir, c.total.atribuido),
      corregirPct: informePct_(corregir, c.total.atribuido),
      otrosPct: informePct_(otros, c.total.atribuido)
    },
    unitarios: {
      porActividadCosteada: c.total.actividades
        ? Math.round(c.total.atribuido / c.total.actividades) : null,
      porSolicitudEntregada: entregadas ? Math.round(c.total.atribuido / entregadas) : null,
      solicitudesEntregadas: entregadas
    },
    // Las fechas que faltan cambian el costo: se informa cuantas, no se esconde.
    actividadesSinFechas: c.incompletasTotal || 0,
    fasesNoAplican: c.fasesNoAplican || 0
  };
}

/* ================================================================== */
/* 10. Calidad de los datos                                            */
/* ================================================================== */

/**
 * Cuanta de la informacion que el informe necesita esta de verdad diligenciada.
 *
 * Septiembre de 2026 es el primer mes de uso de la herramienta y el equipo esta
 * llenando las columnas hacia atras. Un informe de comite que no diga sobre que
 * cobertura se calculo invita a tomar por completo algo que no lo esta, y el
 * dia que alguien lo cruce con otra fuente se cae la credibilidad de todo el
 * tablero, no solo de la cifra.
 *
 * @param {!Object} datos
 * @param {!Object} iniciativas
 * @param {!Object} ciclo
 * @return {!Object}
 * @private
 */
function informeCalidadDatos_(datos, iniciativas, ciclo) {
  var deFabrica = datos.solicitudesFabrica;
  var conTodas = 0;
  deFabrica.forEach(function (s) {
    var completa = INFORME_FASES_CON_FECHAS.every(function (d) {
      if (d.no && esSi_(s[d.no])) return true;
      return !!aFecha_(s[d.ini]);
    });
    if (completa) conTodas++;
  });

  var avisos = [];
  if (iniciativas.origen.deducida || iniciativas.origen.varias || iniciativas.origen.ninguna) {
    avisos.push({
      clave: 'plataformaIniciativa',
      titulo: 'Iniciativas sin plataforma declarada',
      detalle: iniciativas.origen.deducida + ' se agruparon deduciendo la plataforma de sus ' +
               'solicitudes, ' + iniciativas.origen.varias + ' tocan varias plataformas y ' +
               iniciativas.origen.ninguna + ' no tienen ninguna. El campo "Plataforma digital" ' +
               'de la iniciativa esta sin llenar.',
      donde: 'Administración → Iniciativas'
    });
  }
  if (!iniciativas.origen.declarada && !datos.proyectos.length) {
    avisos.push({ clave: 'sinIniciativas', titulo: 'No hay iniciativas registradas',
                  detalle: 'El informe no puede agrupar nada.', donde: 'Administración → Iniciativas' });
  }
  var sinFechas = ciclo.fases.reduce(function (a, f) { return a + f.sinFechas; }, 0);
  if (sinFechas) {
    avisos.push({
      clave: 'fechasPorFase',
      titulo: 'Fases sin fechas registradas',
      detalle: sinFechas + ' tramos de fase no tienen fecha de inicio ni de fin, y por eso no ' +
               'entran en el Cycle Time ni en el costo.',
      donde: 'Costos → Actividades sin fechas registradas'
    });
  }
  if (ciclo.sinColumnas.length) {
    avisos.push({
      clave: 'fasesSinColumnas',
      titulo: 'Dos fases no se pueden medir',
      detalle: ciclo.sinColumnas.map(function (f) { return f.nombre; }).join(' y ') +
               ' no tienen columnas de fecha de inicio y fin en la solicitud, asi que su ' +
               'duracion no se mide con esta fuente.',
      donde: 'Pendiente de modelo'
    });
  }

  return {
    solicitudesFabrica: deFabrica.length,
    conTodasLasFechas: conTodas,
    coberturaPct: informePct_(conTodas, deFabrica.length),
    filasBitacora: datos.auditoria.length,
    avisos: avisos
  };
}

/* ================================================================== */
/* El armado                                                           */
/* ================================================================== */

/**
 * Arma el informe completo de un mes.
 * @param {string} mes 'yyyy-MM'
 * @return {!Object}
 * @private
 */
function calcularInforme_(mes) {
  var lim = limitesDelMes_(mes);
  var datos = cargarDatos_();

  var iniciativas = informeIniciativasPorPlataforma_(datos);
  var portafolio = tarjetasDeIniciativas_(datos);
  var versiones = informeVersiones_(datos, lim);
  var embudo = informeEmbudo_(datos, lim);
  var bloqueos = informeBloqueos_(datos, lim);
  var ciclo = informeCicloPorFase_(datos, lim);
  var distribucion = informeDistribucionPlataforma_(datos, lim);
  var costos = informeCostos_(mes, datos);
  var calidad = informeCalidadDatos_(datos, iniciativas, ciclo);

  /* La portada: los numeros que un comite lee primero. Se arman aqui y no en la
     pantalla porque son los mismos que ya calcularon los bloques, y recalcularlos
     en el navegador es como terminan dos cifras distintas para lo mismo en la
     misma pagina. */
  var titulares = {
    versionesEntregadas: versiones.entregadas.length,
    solicitudesEntregadas: versiones.solicitudesEntregadas,
    llegaronAProduccion: embudo.llegaronAProduccion,
    entraronAlEmbudo: embudo.entraronAlEmbudo,
    enVuelo: embudo.totalEnVuelo,
    bloqueosDelMes: bloqueos.episodiosTotal,
    bloqueosAbiertos: bloqueos.sigueAbiertos,
    diasHabilesPerdidos: bloqueos.diasHabilesPerdidos,
    puntualidadPct: versiones.puntualidad.pct,
    iniciativasActivas: iniciativas.total,
    iniciativasConBloqueo: portafolio.conBloqueo,
    iniciativasAtrasadas: portafolio.atrasadas,
    coberturaDatosPct: calidad.coberturaPct,
    pctAtribuido: costos.disponible ? costos.pctAtribuido : null
  };

  return {
    mes: mes,
    mesAnterior: informeMesAnterior_(mes),
    generado: Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm'),
    titulares: titulares,
    iniciativas: iniciativas,
    portafolio: portafolio,
    versiones: versiones,
    embudo: embudo,
    bloqueos: bloqueos,
    ciclo: ciclo,
    distribucion: distribucion,
    costos: costos,
    calidad: calidad,
    plataformas: getPlataformas_(),
    fases: FASES
  };
}

/* ================================================================== */
/* El soporte: el informe en una hoja de calculo                       */
/* ================================================================== */

/**
 * Genera el soporte del informe en una hoja de calculo nueva.
 *
 * El informe se proyecta en el comite, pero lo que se anexa al acta tiene que
 * ser auditable: una cifra que nadie puede abrir no se puede defender. Este
 * archivo trae, pestana por pestana, las filas con las que se calculo cada
 * bloque de la pantalla.
 *
 * Este archivo tampoco lleva el valor de las bolsas, por la misma razon que no
 * lo lleva la pantalla: se comparte con el comite. Quien necesite el detalle del
 * contrato usa el Excel de Costos, que exige el permiso de costos.
 *
 * @param {string} mes 'yyyy-MM'
 * @return {{url: string, nombre: string}}
 */
function getInformeDetalle(mes) {
  exigirPagina_('informe');
  var m = informeMesValido_(mes);
  var r = calcularInforme_(m);
  var nombreFase = mapaCatalogo_(FASES);
  var nombreEstadoIni = mapaEstadosIniciativa();

  var libro = SpreadsheetApp.create(
      'Informe de gestión · ' + m + ' · ' +
      Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm'));

  var fecha = function (d) {
    return d ? Utilities.formatDate(new Date(d), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd') : '';
  };

  /* --- 1. Portada: los numeros del mes y su cobertura --- */
  var t = r.titulares;
  var portada = [['Informe de gestión', m],
    [''],
    ['Indicador', 'Valor'],
    ['Versiones entregadas a producción', t.versionesEntregadas],
    ['Solicitudes incluidas en esas versiones', t.solicitudesEntregadas],
    ['Solicitudes que llegaron a producción en el mes', t.llegaronAProduccion],
    ['Solicitudes que entraron al embudo en el mes', t.entraronAlEmbudo],
    ['Solicitudes en vuelo (foto de hoy)', t.enVuelo],
    ['Bloqueos que tocaron el mes', t.bloqueosDelMes],
    ['De esos, siguen abiertos', t.bloqueosAbiertos],
    ['Días hábiles perdidos por bloqueo', t.diasHabilesPerdidos],
    ['Puntualidad de las versiones (%)', t.puntualidadPct],
    ['Iniciativas registradas', t.iniciativasActivas],
    ['Iniciativas por debajo de su plan', t.iniciativasAtrasadas],
    ['Iniciativas con alguna solicitud bloqueada', t.iniciativasConBloqueo],
    ['Cobertura de fechas por fase (%)', t.coberturaDatosPct],
    ['Capacidad de fábrica con trazabilidad (%)', t.pctAtribuido],
    [''],
    ['Generado', r.generado],
    ['Fuente de las duraciones', 'Columnas de fecha de la solicitud, no la bitácora'],
    ['SLA', 'Valores de referencia, pendientes de aprobación'],
    ['Costos', 'Solo porcentajes y costos unitarios: no incluye el valor de las bolsas']];
  escribirHoja_(libro, 'Portada', portada, 0);

  /* --- 2. Iniciativas por plataforma --- */
  var ini = [['Plataforma', 'Iniciativa', 'ID', 'Estado', 'Cómo se asignó la plataforma']];
  r.iniciativas.porPlataforma.forEach(function (p) {
    p.iniciativas.forEach(function (x) {
      ini.push([p.nombre, x.nombre, x.id, x.estadoNombre, x.origenPlataforma]);
    });
  });
  escribirHoja_(libro, 'Iniciativas', ini, 1);

  /* --- 2.b Portafolio: una fila por iniciativa, en el mismo orden --- */
  var pf = [['Iniciativa', 'ID', 'Estado', 'Prioridad', 'Tipo de iniciativa', 'Plataforma',
             '¿Plataforma declarada?', 'Fecha inicio', 'Fecha fin planeada',
             '% avance real', '% avance esperado', 'Desviación',
             '¿Tiene bloqueo?', 'Solicitudes bloqueadas', 'Solicitudes', 'Incidentes']];
  r.portafolio.tarjetas.forEach(function (t) {
    pf.push([t.nombre, t.id, t.estadoNombre, t.prioridadNombre, t.tipoNombre, t.plataforma,
             t.origenPlataforma, fecha(t.fechaInicio), fecha(t.fechaFinPlaneada),
             t.avanceReal, t.avanceEsperado, t.desviacion,
             t.tieneBloqueo ? 'sí' : 'no',
             t.detalleBloqueo.map(function (b) { return b.id; }).join(', '),
             t.actividades, t.estabilizaciones]);
  });
  escribirHoja_(libro, 'Portafolio', pf, 2);

  /* --- 3. Versiones entregadas, con su contenido --- */
  var ver = [['Plataforma', 'Versión', 'Fecha planeada', 'Fecha real', 'Desvío (días)',
              'ID solicitud', 'Solicitud', 'Tipo', '¿En producción?']];
  r.versiones.entregadas.forEach(function (v) {
    if (!v.solicitudes.length) {
      ver.push([v.plataforma, v.numero, fecha(v.fechaPlaneada), fecha(v.fechaReal),
                v.desvioDias, '', '(sin solicitudes asociadas)', '', '']);
      return;
    }
    v.solicitudes.forEach(function (s) {
      ver.push([v.plataforma, v.numero, fecha(v.fechaPlaneada), fecha(v.fechaReal),
                v.desvioDias, s.id, s.nombre, s.tipoNombre, s.enProduccion ? 'sí' : 'no']);
    });
  });
  escribirHoja_(libro, 'Versiones entregadas', ver, 3);

  /* --- 4. Versiones planeadas que no salieron --- */
  var plan = [['Plataforma', 'Versión', 'Fecha planeada', 'Estado', 'Solicitudes comprometidas']];
  r.versiones.planeadasDelMes.forEach(function (v) {
    plan.push([v.plataforma, v.numero, fecha(v.fechaPlaneada), v.estadoRelease, v.cuenta]);
  });
  if (r.versiones.planeadasFuturas.length) {
    plan.push([]);
    plan.push(['Planeadas para después del mes']);
    r.versiones.planeadasFuturas.forEach(function (v) {
      plan.push([v.plataforma, v.numero, fecha(v.fechaPlaneada), v.estadoRelease, v.cuenta]);
    });
  }
  escribirHoja_(libro, 'Versiones planeadas', plan, 4);

  /* --- 5. El embudo --- */
  var emb = [['Fase', 'Solicitudes en la fase (hoy)', 'Bloqueadas',
              'Entradas en el mes', 'Salidas en el mes']];
  r.embudo.fases.forEach(function (f) {
    emb.push([f.nombre, f.enFase, f.bloqueadas, f.entradas, f.salidas]);
  });
  escribirHoja_(libro, 'Ciclo de fábrica', emb, 5);

  /* --- 6. Cycle Time contra SLA --- */
  var cic = [['Fase', 'Fases cerradas en el mes', 'Promedio (días hábiles)', 'Mediana',
              'Percentil 85', 'SLA de referencia', 'Fuera de SLA', 'Cumplimiento (%)',
              'En curso', 'Sin fechas', 'No aplica']];
  r.ciclo.fases.forEach(function (f) {
    cic.push([f.nombre, f.cerradas, f.promedio, f.mediana, f.p85, f.sla, f.fueraDeSla,
              f.cumplimientoPct, f.enCurso, f.sinFechas, f.noAplica]);
  });
  r.ciclo.sinColumnas.forEach(function (f) {
    cic.push([f.nombre, 'no se mide', '', '', '', f.sla, '', '', '', '', '']);
  });
  escribirHoja_(libro, 'Cycle Time vs SLA', cic, 6);

  /* --- 7. Bloqueos --- */
  var blo = [['ID solicitud', 'Solicitud', 'Fase', 'Desde', 'Hasta',
              '¿Sigue abierto?', 'Días hábiles en el mes', 'Causal']];
  r.bloqueos.episodios.forEach(function (e) {
    blo.push([e.id, e.nombre, nombreFase[e.fase] || e.fase,
              fecha(e.desde), e.hasta ? fecha(e.hasta) : '(abierto)',
              e.sigueAbierto ? 'sí' : 'no', e.diasHabiles, e.causalNombre]);
  });
  escribirHoja_(libro, 'Bloqueos', blo, 7);

  /* --- 8. Distribución por plataforma --- */
  var dis = [['Plataforma', 'En vuelo', '% en vuelo', 'Entregadas en el mes', '% entregadas',
              'Registradas en el mes', '% registradas', 'Bloqueadas',
              'En producción sin fecha de despliegue']];
  r.distribucion.plataformas.forEach(function (p) {
    dis.push([p.nombre, p.enVuelo, p.pctEnVuelo, p.entregadas, p.pctEntregadas,
              p.registradas, p.pctRegistradas, p.bloqueadas, p.enProduccionSinFecha]);
  });
  escribirHoja_(libro, 'Distribución', dis, 8);

  /* --- 9. Mezcla de inversión, en porcentaje --- */
  var mez = [['Eje', 'Categoría', 'Iniciativas', 'Actividades', '% del valor entregado']];
  if (r.costos.disponible) {
    [['Línea estratégica', r.costos.porLinea],
     ['Vertical', r.costos.porVertical],
     ['Tipo de iniciativa', r.costos.porTipoIniciativa]].forEach(function (par) {
      par[1].forEach(function (x) {
        mez.push([par[0], x.nombre, x.iniciativas, x.actividades, x.pct]);
      });
    });
    r.costos.porTipoSolicitud.forEach(function (x) {
      mez.push(['Tipo de solicitud', x.nombre, '', x.actividades, x.pct]);
    });
    mez.push([]);
    mez.push(['Indicador', 'Valor']);
    mez.push(['Capacidad con trazabilidad (%)', r.costos.pctAtribuido]);
    mez.push(['Capacidad sin atribuir (%)', r.costos.pctSinAtribuir]);
    mez.push(['Construir (%)', r.costos.construirVsCorregir.construirPct]);
    mez.push(['Corregir incidentes (%)', r.costos.construirVsCorregir.corregirPct]);
    mez.push(['Costo por actividad costeada', r.costos.unitarios.porActividadCosteada]);
    mez.push(['Costo por solicitud entregada', r.costos.unitarios.porSolicitudEntregada]);
  } else {
    mez.push(['', 'No disponible: ' + r.costos.motivo, '', '', '']);
  }
  escribirHoja_(libro, 'Mezcla de inversión', mez, 9);

  /* --- 10. Calidad de los datos: por que una cifra puede estar incompleta --- */
  var cal = [['Indicador', 'Valor'],
             ['Solicitudes de fábrica', r.calidad.solicitudesFabrica],
             ['Con todas las fechas por fase', r.calidad.conTodasLasFechas],
             ['Cobertura (%)', r.calidad.coberturaPct],
             ['Filas en la bitácora', r.calidad.filasBitacora],
             ['']];
  cal.push(['Aviso', 'Detalle', 'Dónde se corrige']);
  r.calidad.avisos.forEach(function (a) { cal.push([a.titulo, a.detalle, a.donde]); });
  if (r.versiones.sinVersionReconocida.length) {
    cal.push([]);
    cal.push(['Entregado sin versión reconocida', 'ID', 'Solicitud', 'Plataforma', 'Versión escrita']);
    r.versiones.sinVersionReconocida.forEach(function (s) {
      cal.push(['', s.id, s.nombre, s.plataforma, s.version]);
    });
  }
  escribirHoja_(libro, 'Calidad de los datos', cal, 10);

  var sobra = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (sobra) libro.deleteSheet(sobra);

  return { url: libro.getUrl(), nombre: libro.getName(), mes: m,
           versiones: r.versiones.entregadas.length,
           bloqueos: r.bloqueos.episodiosTotal };
}
