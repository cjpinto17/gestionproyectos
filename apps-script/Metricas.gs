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

/**
 * Los numeros de las tareas, que son otros que los del embudo.
 *
 * Una tarea no tiene lead time por fase ni SLA: lo que importa es cuantas hay
 * abiertas, cuantas se cerraron en la ventana y cuantas estan trabadas o
 * vencidas contra su fecha compromiso.
 *
 * @param {!Array<!Object>} tareas
 * @param {number} meses Ventana de la consulta.
 * @return {!Object}
 * @private
 */
function calcularTareasAbiertas_(tareas, meses) {
  var desde = new Date();
  desde.setMonth(desde.getMonth() - (meses || 12));
  var hoy = new Date();
  hoy.setHours(23, 59, 59, 999);

  var cerradas = 0, abiertas = 0, bloqueadas = 0, vencidas = 0;
  tareas.forEach(function (t) {
    var estado = t.Estado_Actual;
    if (estado === ESTADO_TERMINADA) {
      var cierre = aFecha_(t.Fecha_Ultimo_Cambio);
      if (cierre && cierre >= desde) cerradas++;
      return;
    }
    if (estado === ESTADO_CANCELADA) return;        // no es trabajo pendiente
    abiertas++;
    if (estado === 'EST-04') bloqueadas++;
    var compromiso = aFecha_(t.Fecha_Compromiso);
    if (compromiso && compromiso < hoy) vencidas++;
  });

  return { total: tareas.length, abiertas: abiertas, cerradasEnVentana: cerradas,
           bloqueadas: bloqueadas, vencidas: vencidas };
}

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

  // Una tarea no tiene embudo del cual leer su posicion, asi que aporta por
  // estado (D-79). El 0,5 de "en progreso" es el unico numero convenido de
  // todo el calculo: se prefirio a contarla binaria porque una tarea que lleva
  // tres semanas en curso no es lo mismo que una que no ha empezado.
  if (esTipoTarea(solicitud.Tipo_Solicitud)) {
    return solicitud.Estado_Actual === 'EST-02' ? 0.5 : 0;
  }

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
 * Lee de Sheets lo que necesitan los indicadores, una sola vez por peticion.
 * Evita que cada metrica vuelva a abrir el libro.
 *
 * Cada propiedad se lee la primera vez que alguien la pide, no al llamar esta
 * funcion. La razon es la matriz de iniciativas: solo necesita solicitudes,
 * iniciativas y personas, y estaba pagando ademas la lectura completa de la
 * bitacora de transiciones —la tabla mas grande, y la unica que crece sin
 * techo—, del roadmap y de los SLA. Eso era casi todo el costo de abrir
 * Seguimiento por primera vez. Quien si necesite la bitacora la pide y la paga;
 * quien no, ya no.
 *
 * Una vez leida, la propiedad se reemplaza por su valor, de modo que leerla
 * diez veces en el mismo calculo sigue costando una.
 *
 * @return {!Object}
 * @private
 */
function cargarDatos_() {
  var datos = {};

  function perezoso(propiedad, leer) {
    Object.defineProperty(datos, propiedad, {
      enumerable: true,
      configurable: true,
      get: function () {
        var valor = leer();
        Object.defineProperty(datos, propiedad,
                              { enumerable: true, configurable: true, value: valor });
        return valor;
      }
    });
  }

  perezoso('solicitudes', function () { return leerTabla_('Solicitudes'); });
  // Los indicadores del embudo —lead time, SLA, throughput, WIP, first pass
  // yield— cuentan la fase de cada registro. Una tarea no tiene fase, asi que
  // o inflaria la demanda quedandose en la primera o inflaria el throughput
  // si alguien la empujara a la ultima. Se separan en el origen (D-79).
  //
  // Las estabilizaciones se separan por una razon distinta y mas fuerte: no son
  // trabajo planeado sino la consecuencia de un fallo, y contarlas junto a la
  // fabrica ensuciaria para siempre el lead time y el throughput con el tiempo
  // de atender incidentes. Tienen sus propios indicadores (D-101).
  perezoso('solicitudesFabrica', function () {
    return datos.solicitudes.filter(function (s) { return recorreEmbudo(s.Tipo_Solicitud); });
  });
  perezoso('tareas', function () {
    return datos.solicitudes.filter(function (s) { return esTipoTarea(s.Tipo_Solicitud); });
  });
  perezoso('estabilizaciones', function () {
    return datos.solicitudes.filter(function (s) { return esTipoEstabilizacion(s.Tipo_Solicitud); });
  });
  perezoso('auditoria', function () { return leerTabla_('Auditoria_Transiciones'); });
  perezoso('proyectos', function () { return leerTabla_('Proyectos'); });
  perezoso('usuarios', function () { return leerTabla_('Usuarios'); });
  perezoso('roadmap', function () { return leerTabla_('Roadmap_Versiones'); });
  perezoso('sla', function () { return leerTabla_('SLA_Fases'); });

  return datos;
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
  exigirPagina_('home');
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

  anotarDiasHabiles_(datos.auditoria, datos.solicitudesFabrica);
  var leadTime = calcularLeadTime_(datos.solicitudesFabrica);
  var wip = calcularWip_(datos.solicitudesFabrica);
  var throughput = calcularThroughput_(datos.solicitudesFabrica, n);
  var entregadasVentana = throughput.reduce(function (a, m) { return a + m.entregadas; }, 0);
  // La grafica de throughput no sigue el filtro del Home: va siempre a medio
  // ano. Con la ventana en tres meses quedaban tres barras, y tres puntos no
  // dibujan una tendencia. El indicador numerico si respeta el filtro, porque
  // ahi lo que se quiere saber es el ritmo del periodo que se esta mirando.
  var throughputGrafica = calcularThroughput_(datos.solicitudesFabrica, MESES_GRAFICA_THROUGHPUT);

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
      solicitudesTotales: datos.solicitudesFabrica.length,
      solicitudesEnVuelo: datos.solicitudesFabrica.filter(function (s) {
        return FASES_EN_VUELO.indexOf(s.Fase_Actual) !== -1;
      }).length,
      enProduccion: datos.solicitudesFabrica.filter(function (s) {
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
      tiempoConstruccionDias: calcularTiempoConstruccion_(datos.solicitudesFabrica),
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
      demandaVsEntrega: calcularDemandaVsEntrega_(datos.solicitudesFabrica, n)
    },

    calidad: calcularReprocesos_(datos.auditoria, datos.solicitudesFabrica),

    predictibilidad: {
      cumplimientoSlaPorFase: calcularCumplimientoSla_(datos.auditoria, sla),
      cumplimientoFecha: calcularCumplimientoFecha_(datos.roadmap),
      eficienciaFlujoPct: calcularEficienciaFlujo_(datos.auditoria, leadTime)
    },

    tareas: calcularTareasAbiertas_(datos.tareas, n),
    estabilizacion: calidadProduccion_(datos, n),
    bloqueos: calcularBloqueos_(datos.solicitudesFabrica),
    envejecimiento: calcularEnvejecimiento_(datos.solicitudesFabrica, sla),

    distribucion: {
      porPlataforma: contarPor_(datos.solicitudesFabrica, function (s) { return s.Plataforma_ID; }),
      porTipo: contarPor_(datos.solicitudesFabrica, function (s) { return s.Tipo_Solicitud; }),
      porPrioridad: contarPor_(datos.solicitudesFabrica, function (s) { return s.Prioridad; }),
      porFase: contarPor_(datos.solicitudesFabrica, function (s) { return s.Fase_Actual; })
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
  exigirPagina_('reportes');
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
    tiemposPorFase: tiemposPorFase_(datos, ventana),
    auditoria: ordenada.slice(0, 200),
    totalAuditoria: ordenada.length
  };
}

/**
 * Cuanto dura cada fase, leido de la bitacora y no de las estampas.
 *
 * Las estampas de la solicitud guardan una fecha por fase, asi que de una
 * solicitud que paso dos veces por Desarrollo solo cuentan la primera entrada y
 * la ultima salida. La bitacora registra cada movimiento por separado y no
 * sobrescribe nada, asi que es la unica fuente que ve los reprocesos y los
 * saltos. Cada fila trae ya calculados los dias habiles que la solicitud estuvo
 * en la fase que abandona, contados cuando el movimiento ocurrio.
 *
 * Se informa la mediana ademas del promedio: basta una solicitud olvidada seis
 * meses en una fase para que el promedio deje de describir a las demas.
 *
 * @param {!Object} datos
 * @param {!Array<string>} ventana Meses a considerar.
 * @return {!Array<!Object>}
 * @private
 */
function tiemposPorFase_(datos, ventana) {
  var porFase = {};
  FASES.forEach(function (f) {
    porFase[f.id] = { dias: [], solicitudes: {}, devoluciones: 0 };
  });

  datos.auditoria.forEach(function (a) {
    var fecha = aFecha_(a.Fecha_Hora_Cambio);
    if (!fecha || ventana.indexOf(claveMes_(fecha)) === -1) return;

    // Una devolucion se anota en la fase que recibe el trabajo de vuelta: es
    // la que lo va a rehacer, y la que conviene mirar cuando se repiten.
    if (a.Fase_Origen && a.Fase_Destino &&
        ordenDeFase(a.Fase_Destino) < ordenDeFase(a.Fase_Origen) &&
        porFase[a.Fase_Destino]) {
      porFase[a.Fase_Destino].devoluciones++;
    }

    // El tiempo que trae la fila es el de la fase que se abandona. La de
    // creacion no tiene origen, y las tareas no recorren el embudo (D-79).
    var origen = a.Fase_Origen;
    if (!origen || !porFase[origen]) return;
    var dias = Number(a.Dias_Habiles_En_Fase);
    if (isNaN(dias)) return;
    porFase[origen].dias.push(dias);
    porFase[origen].solicitudes[a.ID_Solicitud] = true;
  });

  // Cuantas solicitudes de fabrica estan hoy en cada fase, que es tiempo que
  // todavia corre y que la bitacora no puede haber contado.
  var enCurso = {};
  datos.solicitudesFabrica.forEach(function (s) {
    if (s.Estado_Actual === ESTADO_TERMINADA || s.Estado_Actual === ESTADO_CANCELADA) return;
    if (s.Fase_Actual) enCurso[s.Fase_Actual] = (enCurso[s.Fase_Actual] || 0) + 1;
  });

  var redondear = function (v) { return v === null ? null : Math.round(v * 10) / 10; };

  return FASES.map(function (f) {
    var d = porFase[f.id];
    return {
      fase: f.id,
      nombre: f.nombre,
      orden: f.orden,
      pasos: d.dias.length,
      solicitudes: Object.keys(d.solicitudes).length,
      promedio: redondear(promedio_(d.dias)),
      mediana: redondear(mediana_(d.dias)),
      maximo: d.dias.length ? Math.max.apply(null, d.dias) : null,
      devoluciones: d.devoluciones,
      enCurso: enCurso[f.id] || 0
    };
  });
}

/**
 * Pagina Roadmap: versiones agrupadas por plataforma digital, con la fecha
 * planeada y la fecha real de paso a produccion.
 * @return {!Object}
 */
function getRoadmapVersiones() {
  exigirPagina_('roadmap');
  var datos = cargarDatos_();
  var nombrePlataforma = mapaPlataformas();

  var porPlataforma = {};
  datos.roadmap.forEach(function (v) {
    var idPlat = v.Plataforma_ID || 'SIN_PLATAFORMA';
    var plan = aFecha_(v.Fecha_Planeada), real = aFecha_(v.Fecha_Despliegue_Real);

    // Las actividades de esta version: se relacionan por numero de version y
    // plataforma, que es como la fabrica las asigna.
    var suyas = datos.solicitudes.filter(function (s) {
      return s.Version_Semantica === v.Numero_Version && s.Plataforma_ID === idPlat;
    });

    porPlataforma[idPlat] = porPlataforma[idPlat] || [];
    porPlataforma[idPlat].push({
      idVersion: v.ID_Version,
      numeroVersion: v.Numero_Version,
      plataforma: nombrePlataforma[idPlat] || idPlat,
      estadoRelease: v.Estado_Release,
      fechaPlaneada: v.Fecha_Planeada || null,
      fechaReal: v.Fecha_Despliegue_Real || null,
      desvioDias: (plan && real) ? red_((real.getTime() - plan.getTime()) / MS_DIA) : null,
      actividades: suyas.map(function (s) {
        return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud, fase: s.Fase_Actual,
                 estado: s.Estado_Actual, responsable: s.Responsable_ID,
                 // El tipo viaja con cada actividad: una version de siete
                 // ajustes y una de siete cosas nuevas valen lo mismo en el
                 // contador y no significan lo mismo (D-103).
                 tipo: s.Tipo_Solicitud || '' };
      }),
      porTipo: contarPor_(suyas, function (s) { return s.Tipo_Solicitud; }),
      // Cuantas de las comprometidas ya estan de verdad en produccion. En una
      // version ya desplegada son todas; en una planeada dice cuanto falta.
      desplegadas: suyas.filter(function (s) { return s.Fase_Actual === 'FAS-08'; }).length,
      porTipoDesplegadas: contarPor_(
        suyas.filter(function (s) { return s.Fase_Actual === 'FAS-08'; }),
        function (s) { return s.Tipo_Solicitud; })
    });
  });

  Object.keys(porPlataforma).forEach(function (k) {
    porPlataforma[k].sort(function (a, b) {
      return String(a.fechaPlaneada || '').localeCompare(String(b.fechaPlaneada || ''));
    });
  });

  return {
    plataformas: getPlataformas_(),
    // Los tipos viajan con su orden del catalogo: el contador agrupa por ellos y
    // tiene que decir "Nuevo" y no "TIP-03" aunque alguien los renombre.
    tipos: getTiposSolicitud_(),
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

/* ================================================================== */
/* Calidad en produccion: los numeros de la estabilizacion (D-101)      */
/* ================================================================== */

/** Dias habiles dentro de los cuales un incidente se atribuye al despliegue. */
var DIAS_ESCAPE = 15;

/** Dias dentro de los cuales dos incidentes de la misma causa son reincidencia. */
var DIAS_REINCIDENCIA = 90;

/**
 * Los indicadores de lo que se rompio despues de salir a produccion.
 *
 * El Home ya medía la calidad DENTRO de la fabrica: first pass yield,
 * reprocesos, devoluciones de QA y de UAT. Todos ellos pueden verse bien y el
 * negocio seguir sufriendo, porque ninguno mira lo que pasa despues del
 * despliegue. Esto mide eso.
 *
 * El indicador que manda es la TASA DE ESCAPE: de lo que salio a produccion en
 * el periodo, cuanto genero una estabilizacion. Se puede entregar mucho y rapido
 * y estar entregando mal, y es el unico numero que lo delata.
 *
 * @param {!Object} datos
 * @param {number} n Ventana en meses.
 * @return {!Object}
 * @private
 */
function calidadProduccion_(datos, n) {
  var ventana = ultimosMeses_(n);
  var nombrePlataforma = mapaPlataformas();
  var nombreCausa = mapaCatalogo_(getCausasRaiz_());
  var versiones = leerTabla_('Roadmap_Versiones');

  // Datos de cada version del Roadmap, para poder hablar de ella por su nombre.
  var version = {};
  versiones.forEach(function (v) {
    if (!v.ID_Version) return;
    version[String(v.ID_Version)] = {
      id: String(v.ID_Version),
      numero: String(v.Numero_Version || v.ID_Version),
      plataformaId: v.Plataforma_ID || '',
      plataforma: nombrePlataforma[v.Plataforma_ID] || v.Plataforma_ID || '',
      desplegada: aFecha_(v.Fecha_Despliegue_Real)
    };
  });

  var enVentana = datos.estabilizaciones.filter(function (s) {
    var f = aFecha_(s.Fecha_Registro);
    return f && ventana.indexOf(claveMes_(f)) !== -1;
  });

  /* --- 1. Por version afectada: que release nos esta costando caro --- */
  var porVersion = {};
  datos.estabilizaciones.forEach(function (s) {
    var v = version[String(s.Version_Afectada)];
    var clave = v ? v.id : 'SIN_VERSION';
    porVersion[clave] = porVersion[clave] || {
      idVersion: clave,
      etiqueta: v ? (v.plataforma + ' ' + v.numero) : 'Sin version registrada',
      plataforma: v ? v.plataforma : '',
      incidentes: 0, criticas: 0, minutosCaida: 0
    };
    var fila = porVersion[clave];
    fila.incidentes++;
    if (exigePostmortem(s.Prioridad)) fila.criticas++;
    fila.minutosCaida += minutosDeIndisponibilidad_(s) || 0;
  });
  var listaVersiones = Object.keys(porVersion).map(function (k) { return porVersion[k]; })
      .sort(function (a, b) { return b.incidentes - a.incidentes; });

  /* --- 2. Tasa de escape --- */
  // Por version: de las que se desplegaron en la ventana, cuantas necesitaron
  // despues una estabilizacion. Es la lectura mas honesta, porque una version es
  // lo que de verdad se entrega al usuario.
  var conIncidente = {};
  datos.estabilizaciones.forEach(function (s) {
    if (s.Version_Afectada) conIncidente[String(s.Version_Afectada)] = true;
  });
  var desplegadasEnVentana = Object.keys(version).filter(function (k) {
    var d = version[k].desplegada;
    return d && ventana.indexOf(claveMes_(d)) !== -1;
  });
  var escaparon = desplegadasEnVentana.filter(function (k) { return conIncidente[k]; });

  // Por actividad: de las que llegaron a produccion en la ventana, cuantas
  // pertenecen a una version que fallo dentro de los dias de escape. Une la
  // actividad con su version por plataforma y numero, que es como el equipo las
  // relaciona hoy (la actividad guarda el numero, no el identificador).
  var incidentesDeVersion = {};
  datos.estabilizaciones.forEach(function (s) {
    var v = version[String(s.Version_Afectada)];
    if (!v) return;
    var f = aFecha_(s.Fecha_Registro);
    if (!f) return;
    var clave = v.plataformaId + '|' + v.numero;
    (incidentesDeVersion[clave] = incidentesDeVersion[clave] || []).push(f);
  });
  var aProduccion = datos.solicitudesFabrica.filter(function (s) {
    var f = aFecha_(s.Fecha_Despliegue);
    return s.Fase_Actual === 'FAS-08' && f && ventana.indexOf(claveMes_(f)) !== -1;
  });
  var conEscape = aProduccion.filter(function (s) {
    var lista = incidentesDeVersion[(s.Plataforma_ID || '') + '|' +
                                   String(s.Version_Semantica || '')];
    if (!lista) return false;
    var despliegue = aFecha_(s.Fecha_Despliegue);
    return lista.some(function (f) {
      return f.getTime() >= despliegue.getTime() &&
             diasHabilesEntre(despliegue, f) <= DIAS_ESCAPE;
    });
  });

  /* --- 3. Indisponibilidad --- */
  var minutosTotal = 0, minutosParcial = 0, sinDato = 0;
  var minutosPorMes = {}, minutosPorPlataforma = {};
  enVentana.forEach(function (s) {
    var min = minutosDeIndisponibilidad_(s);
    if (min === null) {
      if (exigePostmortem(s.Prioridad) && esSi_(s.Hubo_Indisponibilidad)) sinDato++;
      return;
    }
    if (String(s.Tipo_Indisponibilidad) === 'Parcial') minutosParcial += min;
    else minutosTotal += min;

    var f = aFecha_(s.Inicio_Indisponibilidad) || aFecha_(s.Fecha_Registro);
    if (f) {
      var mes = claveMes_(f);
      minutosPorMes[mes] = (minutosPorMes[mes] || 0) + min;
    }
    var plat = nombrePlataforma[s.Plataforma_ID] || s.Plataforma_ID || 'Sin plataforma';
    minutosPorPlataforma[plat] = (minutosPorPlataforma[plat] || 0) + min;
  });

  /* --- 4. Tiempo de atencion, en horas de reloj --- */
  var horasPorPrioridad = {};
  var horas = [];
  enVentana.forEach(function (s) {
    var ini = aFecha_(s.Fecha_Registro);
    var fin = aFecha_(s.Fecha_Despliegue);
    if (!ini || !fin || s.Estado_Actual !== ESTADO_ESTABILIZACION_CERRADA) return;
    var h = (fin.getTime() - ini.getTime()) / 3600000;
    if (h < 0) return;
    horas.push(h);
    var p = s.Prioridad || 'SIN_PRIORIDAD';
    (horasPorPrioridad[p] = horasPorPrioridad[p] || []).push(h);
  });

  /* --- 5. Pareto de causa raiz --- */
  var porCausa = contarPor_(enVentana, function (s) { return s.Causa_Raiz; });
  var totalConCausa = Object.keys(porCausa).reduce(function (a, k) { return a + porCausa[k]; }, 0);
  var pareto = Object.keys(porCausa).map(function (k) {
    return { causa: k, nombre: nombreCausa[k] || k, cuenta: porCausa[k],
             pct: totalConCausa ? red_((porCausa[k] * 100) / totalConCausa) : null };
  }).sort(function (a, b) { return b.cuenta - a.cuenta; });

  /* --- 6. Reincidencia: misma causa, misma plataforma, dentro de 90 dias --- */
  // Es el indicador que mide si los postmortem sirven. Si no baja, se estan
  // escribiendo y no se estan aplicando.
  var porClave = {};
  datos.estabilizaciones.forEach(function (s) {
    if (!s.Causa_Raiz) return;
    var f = aFecha_(s.Fecha_Registro);
    if (!f) return;
    var clave = (s.Plataforma_ID || '') + '|' + s.Causa_Raiz;
    (porClave[clave] = porClave[clave] || []).push({ id: s.ID_Solicitud, fecha: f });
  });
  var reincidencias = [];
  Object.keys(porClave).forEach(function (clave) {
    var lista = porClave[clave].sort(function (a, b) { return a.fecha - b.fecha; });
    for (var i = 1; i < lista.length; i++) {
      var dias = (lista[i].fecha.getTime() - lista[i - 1].fecha.getTime()) / MS_DIA;
      if (dias > DIAS_REINCIDENCIA) continue;
      if (ventana.indexOf(claveMes_(lista[i].fecha)) === -1) continue;
      var partes = clave.split('|');
      reincidencias.push({
        plataforma: nombrePlataforma[partes[0]] || partes[0] || 'Sin plataforma',
        causa: nombreCausa[partes[1]] || partes[1],
        anterior: lista[i - 1].id, repetida: lista[i].id, dias: red_(dias, 0)
      });
    }
  });

  /* --- 7. Lo que esta abierto hoy --- */
  var abiertas = datos.estabilizaciones.filter(function (s) {
    return s.Estado_Actual !== ESTADO_ESTABILIZACION_CERRADA &&
           s.Estado_Actual !== ESTADO_CANCELADA;
  });

  return {
    ventanaMeses: n,
    registradas: enVentana.length,
    criticas: enVentana.filter(function (s) { return exigePostmortem(s.Prioridad); }).length,
    abiertas: abiertas.length,
    abiertasCriticas: abiertas.filter(function (s) { return exigePostmortem(s.Prioridad); }).length,
    // Las que ya se podrian cerrar si alguien registrara lo que falta.
    sinDatosParaCerrar: abiertas.filter(function (s) {
      return !!faltaParaCerrarEstabilizacion_(s);
    }).length,

    escape: {
      diasHabiles: DIAS_ESCAPE,
      versionesDesplegadas: desplegadasEnVentana.length,
      versionesConIncidente: escaparon.length,
      pctVersiones: desplegadasEnVentana.length
          ? red_((escaparon.length * 100) / desplegadasEnVentana.length) : null,
      actividadesAProduccion: aProduccion.length,
      actividadesConEscape: conEscape.length,
      pctActividades: aProduccion.length
          ? red_((conEscape.length * 100) / aProduccion.length) : null
    },

    porVersion: listaVersiones.slice(0, 15),
    pareto: pareto,
    reincidencias: reincidencias,

    indisponibilidad: {
      minutosTotal: minutosTotal,
      minutosParcial: minutosParcial,
      minutos: minutosTotal + minutosParcial,
      horas: red_((minutosTotal + minutosParcial) / 60),
      sinRegistrar: sinDato,
      porMes: ventana.map(function (m) { return { mes: m, minutos: minutosPorMes[m] || 0 }; }),
      porPlataforma: minutosPorPlataforma
    },

    atencion: {
      muestra: horas.length,
      promedioHoras: red_(promedio_(horas)),
      medianaHoras: red_(mediana_(horas)),
      porPrioridad: PRIORIDADES.map(function (p) {
        var lista = horasPorPrioridad[p.id] || [];
        return { prioridad: p.id, nombre: p.nombre, muestra: lista.length,
                 promedioHoras: red_(promedio_(lista)), medianaHoras: red_(mediana_(lista)) };
      }).filter(function (x) { return x.muestra > 0; })
    }
  };
}

/**
 * Pagina Iniciativas: matriz de solo lectura Vertical (filas) x LEN (columnas).
 * Las iniciativas sin clasificar caen en las claves SIN_VERTICAL / SIN_LEN y la
 * pagina las muestra aparte, nunca las oculta.
 * @return {!Object}
 */
function getMatrizIniciativas() {
  exigirPagina_('iniciativas');
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
  var estabilizacionesPorProyecto = {};
  datos.solicitudes.forEach(function (s) {
    // Una estabilizacion no es alcance planeado de la iniciativa: si contara
    // como actividad, un incidente abierto bajaria el avance de la iniciativa
    // —porque aporta 0 hasta cerrarse— y el plan se veria atrasado por algo que
    // no es parte del plan. Se cuenta aparte y se muestra aparte (D-101).
    if (esTipoEstabilizacion(s.Tipo_Solicitud)) {
      estabilizacionesPorProyecto[s.ID_Proyecto] =
          (estabilizacionesPorProyecto[s.ID_Proyecto] || 0) + 1;
      return;
    }
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
      // Se envian los nombres completos y el identificador: la pantalla muestra
      // las iniciales, pero el filtro y el titulo emergente necesitan el resto.
      solicitanteId: p.Solicitante_Usuario || '',
      solicitante: nombreUsuario[p.Solicitante_Usuario] || null,
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
      estabilizaciones: estabilizacionesPorProyecto[p.ID_Proyecto] || 0,
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
