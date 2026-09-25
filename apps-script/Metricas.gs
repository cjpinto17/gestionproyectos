/**
 * Metricas.gs
 * Motor de indicadores de productividad y eficiencia de la fabrica de software.
 *
 * TODO lo que calcula sale exclusivamente de las hojas de Google Sheets:
 *   - Solicitudes            -> estampas de tiempo por fase, bloqueos, plataforma
 *   - Auditoria_Transiciones -> Horas_En_Fase, retrocesos, transiciones por mes
 *   - SLA_Fases              -> objetivo por fase
 *   - Roadmap_Versiones      -> compromiso de fecha planeada vs real
 *
 * No hay constantes de negocio quemadas: si el dato no esta en la hoja, el
 * indicador devuelve null y el frontend lo muestra como "sin datos" en lugar
 * de inventar un valor.
 *
 * Convencion: en Auditoria_Transiciones, Fase_Origen y Fase_Destino guardan el
 * ID de fase (FAS-01..FAS-08), no el nombre. La traduccion a nombre es del
 * frontend.
 */

/** Fases que cuentan como trabajo activo de la fabrica (WIP real). */
var FASES_WIP = ['FAS-03', 'FAS-04', 'FAS-05', 'FAS-06', 'FAS-07'];
/** Fases en las que la solicitud sigue "en vuelo" (aun no esta en produccion). */
var FASES_EN_VUELO = ['FAS-01', 'FAS-02', 'FAS-03', 'FAS-04', 'FAS-05', 'FAS-06', 'FAS-07'];

var MS_HORA = 3600000;
var MS_DIA = 86400000;

/** Estado de solicitud que cuenta como trabajo terminado. */
var ESTADO_TERMINADA = 'EST-06';
/** Estado de solicitud que se descuenta del avance: ya nadie la va a hacer. */
var ESTADO_CANCELADA = 'EST-05';

/* ================================================================== */
/* Avance de una iniciativa: lo que lleva y lo que deberia llevar      */
/* ================================================================== */

/**
 * Cuanto ha avanzado UNA solicitud dentro del embudo, entre 0 y 1.
 *
 * El embudo tiene ocho fases, o sea siete pasos entre la primera y la ultima.
 * Estar en la fase N significa haber completado N-1 pasos: recien registrada
 * (Gestion de la demanda) va en 0, en Desarrollo va en 3/7, y en Produccion
 * —que es la ultima— va en 1. Una solicitud marcada Terminada cuenta como
 * completa aunque su fase diga otra cosa.
 *
 * @param {!Object} solicitud
 * @return {number} Entre 0 y 1.
 * @private
 */
function avanceDeSolicitud_(solicitud) {
  if (solicitud.Estado_Actual === ESTADO_TERMINADA) return 1;
  var pasos = FASES.length - 1;
  if (pasos <= 0) return 0;
  var orden = 0;
  FASES.forEach(function (f, i) { if (f.id === solicitud.Fase_Actual) orden = i + 1; });
  if (!orden) return 0;                       // fase desconocida: no se inventa avance
  return Math.min(1, (orden - 1) / pasos);
}

/**
 * Porcentaje real de avance de una iniciativa, a partir de sus solicitudes.
 *
 * Es el promedio del avance de cada solicitud relacionada. Las canceladas se
 * descuentan del total: dejarlas dentro castigaria a la iniciativa por un
 * trabajo que el propio negocio decidio no hacer.
 *
 * Una iniciativa sin solicitudes devuelve null, no cero: no es que no haya
 * avanzado, es que todavia no hay con que medirlo.
 *
 * @param {!Array<!Object>} solicitudes Las de esa iniciativa.
 * @return {?number} 0 a 100, o null si no hay nada que promediar.
 * @private
 */
function avanceRealIniciativa_(solicitudes) {
  var cuentan = solicitudes.filter(function (s) {
    return s.Estado_Actual !== ESTADO_CANCELADA;
  });
  if (!cuentan.length) return null;
  var suma = 0;
  cuentan.forEach(function (s) { suma += avanceDeSolicitud_(s); });
  return Math.round((suma / cuentan.length) * 1000) / 10;
}

/**
 * Porcentaje que la iniciativa DEBERIA llevar hoy, segun su ventana planeada.
 *
 * Se mide en dias habiles y no en dias calendario, porque es contra dias
 * habiles que el equipo trabaja y que ya se miden los SLA del embudo: un plan
 * que corre en diciembre no avanza los festivos.
 *
 * Antes de la fecha de inicio devuelve 0, y pasada la fecha fin estimada
 * devuelve 100: si ya se vencio el plazo, lo esperado es que estuviera todo.
 *
 * @param {*} fechaInicio
 * @param {*} fechaFinEstimada
 * @param {Date=} hoy Para poder probarlo con una fecha fija.
 * @return {?number} 0 a 100, o null si falta alguna de las dos fechas.
 * @private
 */
function avanceEsperadoIniciativa_(fechaInicio, fechaFinEstimada, hoy) {
  var ini = fechaInicio ? aFecha_(fechaInicio) : null;
  var fin = fechaFinEstimada ? aFecha_(fechaFinEstimada) : null;
  if (!ini || !fin) return null;

  var ahora = hoy || new Date();
  if (ahora <= ini) return 0;
  if (ahora >= fin) return 100;

  var total = diasHabilesEntre(ini, fin);
  if (!total) return 100;                     // ventana de un solo dia habil o menos
  var corridos = diasHabilesEntre(ini, ahora) || 0;
  return Math.max(0, Math.min(100, Math.round((corridos / total) * 1000) / 10));
}

/* ================================================================== */
/* Utilidades de fecha y estadistica                                   */
/* ================================================================== */

/**
 * Convierte a Date los valores que vienen de Sheets (Date, ISO o texto).
 * @param {*} valor
 * @return {?Date} null si el valor esta vacio o no es una fecha valida.
 */
function aFecha_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date} fecha
 * @return {string} Clave de mes 'YYYY-MM' en la zona horaria corporativa.
 */
function claveMes_(fecha) {
  return Utilities.formatDate(fecha, CONFIG.ZONA_HORARIA, 'yyyy-MM');
}

/**
 * @param {number} n Cantidad de meses hacia atras, incluido el actual.
 * @return {!Array<string>} Claves 'YYYY-MM' en orden cronologico.
 */
function ultimosMeses_(n) {
  var meses = [];
  var hoy = new Date();
  for (var i = n - 1; i >= 0; i--) {
    meses.push(claveMes_(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)));
  }
  return meses;
}

/** @return {?number} Promedio, o null si la lista esta vacia. */
function promedio_(valores) {
  if (!valores.length) return null;
  var suma = valores.reduce(function (a, b) { return a + b; }, 0);
  return suma / valores.length;
}

/** @return {?number} Mediana, mas robusta que el promedio ante outliers. */
function mediana_(valores) {
  if (!valores.length) return null;
  var orden = valores.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

/** @return {?number} Percentil 85: compromiso realista de entrega. */
function percentil85_(valores) {
  if (!valores.length) return null;
  var orden = valores.slice().sort(function (a, b) { return a - b; });
  var i = Math.ceil(orden.length * 0.85) - 1;
  return orden[Math.max(0, Math.min(i, orden.length - 1))];
}

/** Redondea a un decimal conservando null. */
function red_(valor, decimales) {
  if (valor === null || valor === undefined) return null;
  var f = Math.pow(10, decimales === undefined ? 1 : decimales);
  return Math.round(valor * f) / f;
}

/** Agrupa una lista contando ocurrencias de la clave que devuelve fn. */
function contarPor_(lista, fn) {
  return lista.reduce(function (acc, item) {
    var k = fn(item);
    if (k === null || k === undefined || k === '') return acc;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

/* ================================================================== */
/* Carga unica de datos                                                */
/* ================================================================== */

/**
 * Lee de Sheets todo lo que necesitan los indicadores, una sola vez por
 * peticion. Evita que cada metrica vuelva a abrir el libro.
 * @return {!Object}
 * @private
 */
function cargarDatos_() {
  return {
    solicitudes: leerTabla_('Solicitudes'),
    auditoria: leerTabla_('Auditoria_Transiciones'),
    proyectos: leerTabla_('Proyectos'),
    usuarios: leerTabla_('Usuarios'),
    roadmap: leerTabla_('Roadmap_Versiones'),
    sla: leerTabla_('SLA_Fases')
  };
}

/** @return {!Object<string,number>} Mapa ID_Fase -> SLA en dias. */
function mapaSla_(filasSla) {
  return filasSla.reduce(function (acc, f) {
    acc[f.ID_Fase] = Number(f.SLA_Dias) || 0;
    return acc;
  }, {});
}

/**
 * Anota cada transicion con los dias habiles consumidos en su fase de origen.
 * Prefiere la columna Dias_Habiles_En_Fase que escribe el backend al registrar
 * la transicion; si no existe (registros antiguos), la recalcula con la marca
 * de tiempo de la transicion anterior de esa misma solicitud.
 *
 * @param {!Array<!Object>} auditoria
 * @param {!Array<!Object>} solicitudes
 * @return {!Array<!Object>} Las mismas filas, con _diasHabiles.
 * @private
 */
function anotarDiasHabiles_(auditoria, solicitudes) {
  var registroDe = {};
  solicitudes.forEach(function (s) { registroDe[s.ID_Solicitud] = aFecha_(s.Fecha_Registro); });

  var porSolicitud = {};
  auditoria.forEach(function (a) {
    (porSolicitud[a.ID_Solicitud] = porSolicitud[a.ID_Solicitud] || []).push(a);
  });

  Object.keys(porSolicitud).forEach(function (id) {
    var filas = porSolicitud[id].sort(function (a, b) {
      return (aFecha_(a.Fecha_Hora_Cambio) || 0) - (aFecha_(b.Fecha_Hora_Cambio) || 0);
    });
    var anterior = registroDe[id] || null;
    filas.forEach(function (a) {
      var guardado = Number(a.Dias_Habiles_En_Fase);
      if (!isNaN(guardado) && a.Dias_Habiles_En_Fase !== '' && a.Dias_Habiles_En_Fase !== null) {
        a._diasHabiles = guardado;
      } else {
        a._diasHabiles = diasHabilesEntre(anterior, aFecha_(a.Fecha_Hora_Cambio));
      }
      anterior = aFecha_(a.Fecha_Hora_Cambio) || anterior;
    });
  });
  return auditoria;
}

/* ================================================================== */
/* Bloque 1 - Velocidad de entrega                                     */
/* ================================================================== */

/**
 * Lead Time (Time to Market): dias entre el registro de la solicitud y su
 * despliegue real en produccion. Es el indicador que ve el negocio.
 * @param {!Array<!Object>} solicitudes
 * @return {!Object} { promedio, mediana, percentil85, muestra, serie }
 */
function calcularLeadTime_(solicitudes) {
  var dias = [];
  var serie = [];
  solicitudes.forEach(function (s) {
    var registro = aFecha_(s.Fecha_Registro);
    var despliegue = aFecha_(s.Fecha_Despliegue);
    if (!registro || !despliegue) return;
    var d = (despliegue.getTime() - registro.getTime()) / MS_DIA;
    if (d < 0) return;
    dias.push(d);
    serie.push({ id: s.ID_Solicitud, dias: red_(d), mes: claveMes_(despliegue) });
  });
  return {
    promedio: red_(promedio_(dias)),
    mediana: red_(mediana_(dias)),
    percentil85: red_(percentil85_(dias)),
    muestra: dias.length,
    serie: serie
  };
}

/**
 * Meses que dibuja la grafica de throughput del Home, sin importar el filtro de
 * la pagina. Medio ano es el minimo con el que se distingue una tendencia de
 * una casualidad.
 */
var MESES_GRAFICA_THROUGHPUT = 6;

/**
 * Throughput: solicitudes desplegadas a produccion por mes. Mide la capacidad
 * real de entrega de la fabrica.
 * @param {!Array<!Object>} solicitudes
 * @param {number} meses
 * @return {!Array<{mes: string, entregadas: number}>}
 */
function calcularThroughput_(solicitudes, meses) {
  var porMes = contarPor_(solicitudes, function (s) {
    var d = aFecha_(s.Fecha_Despliegue);
    return d ? claveMes_(d) : null;
  });
  return ultimosMeses_(meses).map(function (m) {
    return { mes: m, entregadas: porMes[m] || 0 };
  });
}

/**
 * Cycle Time por fase: promedio de Horas_En_Fase registrado en la auditoria,
 * expresado en dias, contrastado contra el SLA de cada fase.
 * @param {!Array<!Object>} auditoria
 * @param {!Object<string,number>} sla
 * @return {!Array<!Object>}
 */
function calcularCycleTimePorFase_(auditoria, sla) {
  var acumulado = {};
  auditoria.forEach(function (a) {
    var fase = a.Fase_Origen;
    var dias = a._diasHabiles;
    if (!fase || dias === null || dias === undefined || dias <= 0) return;
    if (!acumulado[fase]) acumulado[fase] = [];
    acumulado[fase].push(dias);
  });
  return FASES.map(function (f) {
    var muestras = acumulado[f.id] || [];
    var prom = promedio_(muestras);
    var objetivo = sla[f.id] || null;
    return {
      idFase: f.id,
      fase: f.nombre,
      diasHabilesPromedio: red_(prom),
      diasHabilesMediana: red_(mediana_(muestras)),
      slaDias: objetivo,
      cumple: (prom === null || !objetivo) ? null : prom <= objetivo,
      muestra: muestras.length
    };
  });
}

/**
 * Tiempo neto de construccion: Fecha_Fin_Dev - Fecha_Inicio_Dev. Separa el
 * esfuerzo de la fabrica del tiempo de espera administrativa.
 * @param {!Array<!Object>} solicitudes
 * @return {?number} Dias promedio.
 */
function calcularTiempoConstruccion_(solicitudes) {
  var dias = [];
  solicitudes.forEach(function (s) {
    var ini = aFecha_(s.Fecha_Inicio_Dev), fin = aFecha_(s.Fecha_Fin_Dev);
    if (ini && fin && fin >= ini) dias.push((fin.getTime() - ini.getTime()) / MS_DIA);
  });
  return red_(promedio_(dias));
}

/**
 * WIP (trabajo en curso) y su reparto por responsable. Un WIP alto frente al
 * throughput es la causa mas comun de un Lead Time largo (ley de Little).
 * @param {!Array<!Object>} solicitudes
 * @return {!Object}
 */
function calcularWip_(solicitudes) {
  var enFabrica = solicitudes.filter(function (s) {
    return FASES_WIP.indexOf(s.Fase_Actual) !== -1;
  });
  return {
    total: enFabrica.length,
    porFase: contarPor_(enFabrica, function (s) { return s.Fase_Actual; }),
    porResponsable: contarPor_(enFabrica, function (s) { return s.Responsable_ID; }),
    backlog: solicitudes.filter(function (s) { return s.Fase_Actual === 'FAS-02'; }).length,
    demanda: solicitudes.filter(function (s) { return s.Fase_Actual === 'FAS-01'; }).length
  };
}

/**
 * Antiguedad del trabajo en curso y solicitudes estancadas: llevan mas dias en
 * su fase que el SLA definido para esa fase.
 * @param {!Array<!Object>} solicitudes
 * @param {!Object<string,number>} sla
 * @return {!Object}
 */
function calcularEnvejecimiento_(solicitudes, sla) {
  var ahora = new Date().getTime();
  var edades = [];
  var estancadas = [];

  solicitudes.forEach(function (s) {
    if (FASES_EN_VUELO.indexOf(s.Fase_Actual) === -1) return;
    var desde = aFecha_(s.Fecha_Ultimo_Cambio) || aFecha_(s.Fecha_Registro);
    if (!desde) return;
    var dias = diasHabilesEntre(desde, new Date(ahora));
    if (dias === null) return;
    edades.push(dias);
    var objetivo = sla[s.Fase_Actual];
    if (objetivo && dias > objetivo) {
      estancadas.push({
        id: s.ID_Solicitud,
        nombre: s.Nombre_Solicitud,
        fase: s.Fase_Actual,
        diasHabilesEnFase: red_(dias),
        slaDias: objetivo,
        responsable: s.Responsable_ID
      });
    }
  });

  estancadas.sort(function (a, b) { return b.diasHabilesEnFase - a.diasHabilesEnFase; });
  return {
    edadPromedioDiasHabiles: red_(promedio_(edades)),
    estancadas: estancadas,
    totalEstancadas: estancadas.length
  };
}

/* ================================================================== */
/* Bloque 2 - Calidad y reproceso                                      */
/* ================================================================== */

/**
 * Reprocesos: transiciones en las que la solicitud retrocedio de fase, tipico
 * de hallazgos en QA o rechazos en UAT. Es el indicador de calidad de la
 * fabrica: cada retroceso es trabajo que hubo que repetir.
 * @param {!Array<!Object>} auditoria
 * @param {!Array<!Object>} solicitudes
 * @return {!Object}
 */
function calcularReprocesos_(auditoria, solicitudes) {
  var transiciones = 0, retrocesos = 0;
  var porFaseOrigen = {};
  var solicitudesConRetroceso = {};

  auditoria.forEach(function (a) {
    var o = ordenDeFase(a.Fase_Origen), d = ordenDeFase(a.Fase_Destino);
    if (o === -1 || d === -1 || o === d) return;
    transiciones++;
    if (d < o) {
      retrocesos++;
      porFaseOrigen[a.Fase_Origen] = (porFaseOrigen[a.Fase_Origen] || 0) + 1;
      solicitudesConRetroceso[a.ID_Solicitud] = true;
    }
  });

  // First Pass Yield: de lo ya entregado, cuanto llego a produccion sin repetir fase.
  var entregadas = solicitudes.filter(function (s) { return s.Fase_Actual === 'FAS-08'; });
  var limpias = entregadas.filter(function (s) { return !solicitudesConRetroceso[s.ID_Solicitud]; });

  return {
    transiciones: transiciones,
    retrocesos: retrocesos,
    tasaReprocesoPct: transiciones ? red_(retrocesos / transiciones * 100) : null,
    devolucionesQA: porFaseOrigen['FAS-05'] || 0,
    devolucionesUAT: porFaseOrigen['FAS-06'] || 0,
    porFaseOrigen: porFaseOrigen,
    firstPassYieldPct: entregadas.length ? red_(limpias.length / entregadas.length * 100) : null,
    entregadasEvaluadas: entregadas.length
  };
}

/* ================================================================== */
/* Bloque 3 - Predictibilidad y cumplimiento                           */
/* ================================================================== */

/**
 * Cumplimiento de SLA por fase: porcentaje de transiciones que salieron de la
 * fase dentro del objetivo definido en SLA_Fases.
 * @param {!Array<!Object>} auditoria
 * @param {!Object<string,number>} sla
 * @return {!Array<!Object>}
 */
function calcularCumplimientoSla_(auditoria, sla) {
  var dentro = {}, total = {};
  auditoria.forEach(function (a) {
    var objetivo = sla[a.Fase_Origen];
    var dias = a._diasHabiles;
    if (!objetivo || dias === null || dias === undefined || dias <= 0) return;
    total[a.Fase_Origen] = (total[a.Fase_Origen] || 0) + 1;
    if (dias <= objetivo) dentro[a.Fase_Origen] = (dentro[a.Fase_Origen] || 0) + 1;
  });
  return FASES.map(function (f) {
    var t = total[f.id] || 0;
    return {
      idFase: f.id,
      fase: f.nombre,
      slaDias: sla[f.id] || null,
      cumplimientoPct: t ? red_((dentro[f.id] || 0) / t * 100) : null,
      muestra: t
    };
  });
}

/**
 * Cumplimiento de fecha comprometida: compara Fecha_Despliegue_Real contra
 * Fecha_Planeada en el roadmap de versiones.
 * @param {!Array<!Object>} roadmap
 * @return {!Object}
 */
function calcularCumplimientoFecha_(roadmap) {
  var aTiempo = 0, evaluadas = 0, desviaciones = [];
  roadmap.forEach(function (v) {
    var plan = aFecha_(v.Fecha_Planeada), real = aFecha_(v.Fecha_Despliegue_Real);
    if (!plan || !real) return;
    evaluadas++;
    var desvio = (real.getTime() - plan.getTime()) / MS_DIA;
    desviaciones.push(desvio);
    if (desvio <= 0) aTiempo++;
  });
  return {
    onTimePct: evaluadas ? red_(aTiempo / evaluadas * 100) : null,
    desvioPromedioDias: red_(promedio_(desviaciones)),
    versionesEvaluadas: evaluadas
  };
}

/**
 * Eficiencia de flujo: porcentaje del Lead Time en el que la solicitud estuvo
 * avanzando, descontando el tiempo bloqueada. Un valor bajo indica que el
 * cuello de botella son las esperas, no la capacidad tecnica.
 * @param {!Array<!Object>} auditoria
 * @param {!Object} leadTime Resultado de calcularLeadTime_.
 * @return {?number} Porcentaje.
 */
function calcularEficienciaFlujo_(auditoria, leadTime) {
  if (!leadTime.serie.length) return null;

  // Horas bloqueadas: las acumuladas en la transicion que SALE del estado Bloqueada.
  var bloqueadaDesde = {};
  var horasBloqueo = {};
  auditoria.slice().sort(function (a, b) {
    return (aFecha_(a.Fecha_Hora_Cambio) || 0) - (aFecha_(b.Fecha_Hora_Cambio) || 0);
  }).forEach(function (a) {
    var id = a.ID_Solicitud;
    if (bloqueadaDesde[id]) {
      var horas = Number(a.Horas_En_Fase);
      if (!isNaN(horas)) horasBloqueo[id] = (horasBloqueo[id] || 0) + horas;
      bloqueadaDesde[id] = false;
    }
    if (a.Estado_Destino === 'EST-04' || a.Estado_Destino === 'Bloqueada') {
      bloqueadaDesde[id] = true;
    }
  });

  var eficiencias = leadTime.serie.map(function (item) {
    var totalHoras = item.dias * 24;
    if (!totalHoras) return null;
    var bloqueo = horasBloqueo[item.id] || 0;
    return Math.max(0, (totalHoras - bloqueo) / totalHoras * 100);
  }).filter(function (v) { return v !== null; });

  return red_(promedio_(eficiencias));
}

/* ================================================================== */
/* Bloque 4 - Bloqueos y carga de demanda                              */
/* ================================================================== */

/**
 * Bloqueos activos, su peso sobre el trabajo en curso y su reparto por causal.
 * @param {!Array<!Object>} solicitudes
 * @return {!Object}
 */
function calcularBloqueos_(solicitudes) {
  var enVuelo = solicitudes.filter(function (s) {
    return FASES_EN_VUELO.indexOf(s.Fase_Actual) !== -1;
  });
  var bloqueadas = enVuelo.filter(function (s) {
    return String(s.Tiene_Bloqueo).toUpperCase().indexOf('S') === 0;
  });
  return {
    activos: bloqueadas.length,
    porcentajeSobreEnVuelo: enVuelo.length ? red_(bloqueadas.length / enVuelo.length * 100) : null,
    porCausal: contarPor_(bloqueadas, function (s) { return s.Causal_Bloqueo; }),
    detalle: bloqueadas.map(function (s) {
      return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud, causal: s.Causal_Bloqueo, fase: s.Fase_Actual };
    })
  };
}

/**
 * Demanda vs entrega por mes. Si la demanda supera sostenidamente la entrega,
 * el backlog crece y el Lead Time se degrada.
 * @param {!Array<!Object>} solicitudes
 * @param {number} meses
 * @return {!Array<!Object>}
 */
function calcularDemandaVsEntrega_(solicitudes, meses) {
  var registradas = contarPor_(solicitudes, function (s) {
    var d = aFecha_(s.Fecha_Registro);
    return d ? claveMes_(d) : null;
  });
  var entregadas = contarPor_(solicitudes, function (s) {
    var d = aFecha_(s.Fecha_Despliegue);
    return d ? claveMes_(d) : null;
  });
  return ultimosMeses_(meses).map(function (m) {
    var r = registradas[m] || 0, e = entregadas[m] || 0;
    return { mes: m, registradas: r, entregadas: e, neto: r - e };
  });
}

/* ================================================================== */
/* API publica de metricas                                             */
/* ================================================================== */

/**
 * Tablero completo del Home: todos los indicadores de productividad y
 * eficiencia de la fabrica, calculados sobre la data de las hojas.
 * @param {number=} meses Ventana de analisis. Por defecto 12.
 * @return {!Object}
 */
function getMetricasHome(meses) {
  var n = meses || 12;
  return conResultadoEnCache_('metricasHome_' + n, function () {
    return calcularMetricasHome_(n);
  });
}

/**
 * El calculo de verdad de los indicadores del Home. Vive aparte para que
 * getMetricasHome pueda servirlo desde la cache sin rehacerlo.
 * @param {number} n Ventana en meses.
 * @return {!Object}
 * @private
 */
function calcularMetricasHome_(n) {
  var datos = cargarDatos_();
  var sla = mapaSla_(datos.sla);

  anotarDiasHabiles_(datos.auditoria, datos.solicitudes);
  var leadTime = calcularLeadTime_(datos.solicitudes);
  var wip = calcularWip_(datos.solicitudes);
  var throughput = calcularThroughput_(datos.solicitudes, n);
  var entregadasVentana = throughput.reduce(function (a, m) { return a + m.entregadas; }, 0);
  // La grafica de throughput no sigue el filtro del Home: va siempre a medio
  // ano. Con la ventana en tres meses quedaban tres barras, y tres puntos no
  // dibujan una tendencia. El indicador numerico si respeta el filtro, porque
  // ahi lo que se quiere saber es el ritmo del periodo que se esta mirando.
  var throughputGrafica = calcularThroughput_(datos.solicitudes, MESES_GRAFICA_THROUGHPUT);

  return {
    generado: new Date().toISOString(),
    ventanaMeses: n,

    portafolio: {
      iniciativasTotales: datos.proyectos.length,
      iniciativasEnProgreso: datos.proyectos.filter(function (p) {
        return p.Estado_Iniciativa === 'EIN-02';
      }).length,
      iniciativasPorIniciar: datos.proyectos.filter(function (p) {
        return p.Estado_Iniciativa === 'EIN-01';
      }).length,
      solicitudesTotales: datos.solicitudes.length,
      solicitudesEnVuelo: datos.solicitudes.filter(function (s) {
        return FASES_EN_VUELO.indexOf(s.Fase_Actual) !== -1;
      }).length,
      enProduccion: datos.solicitudes.filter(function (s) {
        return s.Fase_Actual === 'FAS-08';
      }).length
    },

    velocidad: {
      leadTimeDias: leadTime.promedio,
      leadTimeMediana: leadTime.mediana,
      leadTimeP85: leadTime.percentil85,
      muestraLeadTime: leadTime.muestra,
      throughputMensual: throughputGrafica,
      mesesGraficaThroughput: MESES_GRAFICA_THROUGHPUT,
      throughputPromedioMes: red_(entregadasVentana / n),
      tiempoConstruccionDias: calcularTiempoConstruccion_(datos.solicitudes),
      cycleTimePorFase: calcularCycleTimePorFase_(datos.auditoria, sla)
    },

    carga: {
      wip: wip.total,
      wipPorFase: wip.porFase,
      wipPorResponsable: wip.porResponsable,
      backlog: wip.backlog,
      demandaSinAtender: wip.demanda,
      // Ley de Little: con el throughput actual, cuanto tarda en vaciarse el WIP.
      tiempoEsperadoEntregaDias: entregadasVentana
          ? red_(wip.total / (entregadasVentana / n / 30))
          : null,
      demandaVsEntrega: calcularDemandaVsEntrega_(datos.solicitudes, n)
    },

    calidad: calcularReprocesos_(datos.auditoria, datos.solicitudes),

    predictibilidad: {
      cumplimientoSlaPorFase: calcularCumplimientoSla_(datos.auditoria, sla),
      cumplimientoFecha: calcularCumplimientoFecha_(datos.roadmap),
      eficienciaFlujoPct: calcularEficienciaFlujo_(datos.auditoria, leadTime)
    },

    bloqueos: calcularBloqueos_(datos.solicitudes),
    envejecimiento: calcularEnvejecimiento_(datos.solicitudes, sla),

    distribucion: {
      porPlataforma: contarPor_(datos.solicitudes, function (s) { return s.Plataforma_ID; }),
      porTipo: contarPor_(datos.solicitudes, function (s) { return s.Tipo_Solicitud; }),
      porPrioridad: contarPor_(datos.solicitudes, function (s) { return s.Prioridad; }),
      porFase: contarPor_(datos.solicitudes, function (s) { return s.Fase_Actual; })
    }
  };
}

/**
 * Pagina de Reportes: actividad mensual y bitacora de auditoria.
 *  - porMesIniciativa: cuantas actividades se trabajaron cada mes y a que
 *    iniciativa pertenecen (un "tema trabajado" es una actividad con al menos
 *    una transicion registrada en ese mes).
 *  - porMesFase: en que fases se concentro el trabajo cada mes.
 * @param {number=} meses
 * @return {!Object}
 */
function getReportes(meses) {
  var n = meses || 12;
  return conResultadoEnCache_('reportes_' + n, function () {
    return calcularReportes_(n);
  });
}

/**
 * El calculo de verdad de los reportes mensuales.
 * @param {number} n Ventana en meses.
 * @return {!Object}
 * @private
 */
function calcularReportes_(n) {
  var datos = cargarDatos_();
  var ventana = ultimosMeses_(n);
  var proyectoDe = {};
  datos.solicitudes.forEach(function (s) { proyectoDe[s.ID_Solicitud] = s.ID_Proyecto; });
  var nombreProyecto = {};
  datos.proyectos.forEach(function (p) { nombreProyecto[p.ID_Proyecto] = p.Nombre_Proyecto; });

  // mes -> proyecto -> set de solicitudes, y mes -> fase -> transiciones
  var porMesIniciativa = {}, porMesFase = {}, vistasPorMes = {};

  datos.auditoria.forEach(function (a) {
    var fecha = aFecha_(a.Fecha_Hora_Cambio);
    if (!fecha) return;
    var mes = claveMes_(fecha);
    if (ventana.indexOf(mes) === -1) return;

    var proyecto = proyectoDe[a.ID_Solicitud] || 'SIN_PROYECTO';
    porMesIniciativa[mes] = porMesIniciativa[mes] || {};
    porMesIniciativa[mes][proyecto] = porMesIniciativa[mes][proyecto] || {};
    porMesIniciativa[mes][proyecto][a.ID_Solicitud] = true;

    vistasPorMes[mes] = vistasPorMes[mes] || {};
    vistasPorMes[mes][a.ID_Solicitud] = true;

    var fase = a.Fase_Destino;
    if (fase) {
      porMesFase[mes] = porMesFase[mes] || {};
      porMesFase[mes][fase] = (porMesFase[mes][fase] || 0) + 1;
    }
  });

  var iniciativasPorMes = ventana.map(function (mes) {
    var porProyecto = porMesIniciativa[mes] || {};
    return {
      mes: mes,
      actividades: Object.keys(vistasPorMes[mes] || {}).length,
      iniciativas: Object.keys(porProyecto).length,
      detalle: Object.keys(porProyecto).map(function (idProy) {
        return {
          idProyecto: idProy,
          nombre: nombreProyecto[idProy] || idProy,
          actividades: Object.keys(porProyecto[idProy]).length
        };
      }).sort(function (a, b) { return b.actividades - a.actividades; })
    };
  });

  var fasesPorMes = ventana.map(function (mes) {
    var fila = { mes: mes, total: 0, fases: {} };
    FASES.forEach(function (f) {
      var v = (porMesFase[mes] || {})[f.id] || 0;
      fila.fases[f.id] = v;
      fila.total += v;
    });
    return fila;
  });

  // La bitacora completa puede tener miles de filas y la pagina solo muestra
  // las ultimas: enviarla entera era el mayor costo de esta consulta.
  var ordenada = datos.auditoria.slice().sort(function (a, b) {
    return (aFecha_(b.Fecha_Hora_Cambio) || 0) - (aFecha_(a.Fecha_Hora_Cambio) || 0);
  });

  return {
    ventanaMeses: n,
    meses: ventana,
    iniciativasPorMes: iniciativasPorMes,
    fasesPorMes: fasesPorMes,
    auditoria: ordenada.slice(0, 200),
    totalAuditoria: ordenada.length
  };
}

/**
 * Pagina Roadmap: versiones agrupadas por plataforma digital, con la fecha
 * planeada y la fecha real de paso a produccion.
 * @return {!Object}
 */
function getRoadmapVersiones() {
  var datos = cargarDatos_();
  var nombrePlataforma = mapaPlataformas();

  var porPlataforma = {};
  datos.roadmap.forEach(function (v) {
    var idPlat = v.Plataforma_ID || 'SIN_PLATAFORMA';
    var plan = aFecha_(v.Fecha_Planeada), real = aFecha_(v.Fecha_Despliegue_Real);

    porPlataforma[idPlat] = porPlataforma[idPlat] || [];
    porPlataforma[idPlat].push({
      idVersion: v.ID_Version,
      numeroVersion: v.Numero_Version,
      plataforma: nombrePlataforma[idPlat] || idPlat,
      estadoRelease: v.Estado_Release,
      fechaPlaneada: v.Fecha_Planeada || null,
      fechaReal: v.Fecha_Despliegue_Real || null,
      desvioDias: (plan && real) ? red_((real.getTime() - plan.getTime()) / MS_DIA) : null,
      actividades: datos.solicitudes.filter(function (s) {
        return s.Version_Semantica === v.Numero_Version && s.Plataforma_ID === idPlat;
      }).map(function (s) {
        return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud, fase: s.Fase_Actual,
                 estado: s.Estado_Actual, responsable: s.Responsable_ID };
      })
    });
  });

  Object.keys(porPlataforma).forEach(function (k) {
    porPlataforma[k].sort(function (a, b) {
      return String(a.fechaPlaneada || '').localeCompare(String(b.fechaPlaneada || ''));
    });
  });

  return {
    plataformas: getPlataformas_(),
    porPlataforma: porPlataforma,
    cumplimiento: calcularCumplimientoFecha_(datos.roadmap)
  };
}

/**
 * Resuelve una prioridad venga como codigo (PRI-01) o como texto ("Critica",
 * "critica", "Crítica"). La data original del portafolio llego con el nombre,
 * mientras que el catalogo y los formularios usan el codigo.
 * @param {*} valor
 * @return {string} ID del catalogo, o '' si no se reconoce.
 * @private
 */
function normalizarPrioridad_(valor) {
  if (!valor) return '';
  var texto = String(valor).trim();
  var sinTildes = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (var i = 0; i < PRIORIDADES.length; i++) {
    var p = PRIORIDADES[i];
    if (texto === p.id) return p.id;
    if (p.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === sinTildes) {
      return p.id;
    }
  }
  return '';
}

/**
 * Pagina Iniciativas: matriz de solo lectura Vertical (filas) x LEN (columnas).
 * Las iniciativas sin clasificar caen en las claves SIN_VERTICAL / SIN_LEN y la
 * pagina las muestra aparte, nunca las oculta.
 * @return {!Object}
 */
function getMatrizIniciativas() {
  return conResultadoEnCache_('matrizIniciativas', calcularMatrizIniciativas_);
}

/**
 * El armado de verdad de la matriz de iniciativas.
 * @return {!Object}
 * @private
 */
function calcularMatrizIniciativas_() {
  var datos = cargarDatos_();
  var nombrePlataforma = mapaPlataformas();
  var nombreUsuario = {};
  datos.usuarios.forEach(function (u) { nombreUsuario[u.ID_Usuario] = u.Nombre_Completo; });

  var actividadesPorProyecto = {};
  var abiertasPorProyecto = {};
  var solicitudesPorProyecto = {};
  datos.solicitudes.forEach(function (s) {
    actividadesPorProyecto[s.ID_Proyecto] = (actividadesPorProyecto[s.ID_Proyecto] || 0) + 1;
    if (FASES_EN_VUELO.indexOf(s.Fase_Actual) !== -1) {
      abiertasPorProyecto[s.ID_Proyecto] = (abiertasPorProyecto[s.ID_Proyecto] || 0) + 1;
    }
    (solicitudesPorProyecto[s.ID_Proyecto] =
        solicitudesPorProyecto[s.ID_Proyecto] || []).push(s);
  });

  // Una sola vez para todas: el avance esperado se compara siempre contra el
  // mismo instante, si no dos iniciativas medidas con milisegundos distintos
  // podrian no cuadrar entre si.
  var ahora = new Date();

  var celdas = {};
  datos.proyectos.forEach(function (p) {
    var clave = (p.Vertical_ID || 'SIN_VERTICAL') + '|' + (p.LEN_ID || 'SIN_LEN');
    celdas[clave] = celdas[clave] || [];
    celdas[clave].push({
      idProyecto: p.ID_Proyecto,
      nombre: p.Nombre_Proyecto,
      prioridad: normalizarPrioridad_(p.Prioridad),
      prioridadNombre: mapaCatalogo_(PRIORIDADES)[normalizarPrioridad_(p.Prioridad)] ||
                       (p.Prioridad || ''),
      tipo: p.Tipo_Iniciativa || null,
      bo: nombreUsuario[p.BO_Usuario] || null,
      po: nombreUsuario[p.PO_Usuario] || null,
      estado: p.Estado_Iniciativa || null,
      fechaInicio: p.Fecha_Inicio || null,
      fechaFinPlaneada: p.Fecha_Fin_Estimada || null,
      plataformaId: p.Plataforma_ID || '',
      plataforma: nombrePlataforma[p.Plataforma_ID] || null,
      fechaFinReal: p.Fecha_Fin_Real || null,
      actividades: actividadesPorProyecto[p.ID_Proyecto] || 0,
      actividadesAbiertas: abiertasPorProyecto[p.ID_Proyecto] || 0,
      avanceReal: avanceRealIniciativa_(solicitudesPorProyecto[p.ID_Proyecto] || []),
      avanceEsperado: avanceEsperadoIniciativa_(p.Fecha_Inicio, p.Fecha_Fin_Estimada, ahora),
      lenId: p.LEN_ID || null,
      verticalId: p.Vertical_ID || null
    });
  });

  return {
    lineas: getLineasEstrategicas_(),
    verticales: getVerticales_(),
    tipos: getTiposIniciativa_(),
    estados: ESTADOS_INICIATIVA,
    prioridades: PRIORIDADES,
    plataformas: getPlataformas_(),
    celdas: celdas,
    totalIniciativas: datos.proyectos.length
  };
}
