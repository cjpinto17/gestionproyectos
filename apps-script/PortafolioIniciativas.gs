/**
 * PortafolioIniciativas.gs | El portafolio de iniciativas en tarjetas.
 *
 * El archivo NO puede llamarse Portafolio.gs: Apps Script ignora la extension y
 * Portafolio.gs con Portafolio.html serian dos archivos con el mismo nombre, que
 * es lo que rompio un despliegue en silencio (D-111).
 *
 * Aqui vive el constructor de las tarjetas, y vive aqui y no en InformeGestion.gs
 * porque lo consumen DOS paginas: el Portafolio y el Informe de gestion. Con el
 * calculo escrito dos veces, la misma iniciativa podria mostrar avances
 * distintos en dos pantallas de la misma aplicacion, que es exactamente el
 * defecto que costo D-127 (D-129).
 */

/* El estado "Bloqueada" del catalogo. El bloqueo de una solicitud es su estado:
   mover la tarjeta a Bloqueada y que la marca dijera otra cosa serian dos
   verdades para lo mismo (Codigo.gs). */
var PORTAFOLIO_ESTADO_BLOQUEADA = 'EST-04';

/* La iniciativa en pausa. No es un estado malo por si mismo —el negocio puede
   pausar a proposito— pero una iniciativa pausada que nadie recuerda es un
   compromiso que sigue contando en el portafolio y no avanza, asi que la tarjeta
   la senala. */
var PORTAFOLIO_ESTADO_PAUSA = 'EIN-03';

/**
 * El portafolio de iniciativas, para la pagina del mismo nombre.
 *
 * Trae TODAS las iniciativas con todo lo que la tarjeta necesita: la pantalla
 * filtra y ordena en el navegador, sin volver a pedir nada. Son decenas de
 * iniciativas, no miles, y pedirlas de nuevo por cada filtro haria esperar para
 * esconder tarjetas que ya estan en la pagina.
 *
 * @param {boolean=} forzar Relee las hojas antes de calcular.
 * @return {!Object}
 */
function getPortafolio(forzar) {
  exigirPagina_('portafolio');

  /* Lo que alguien corrige A MANO en el Sheets no mueve los sellos, asi que el
     boton de recargar tiene que releer de verdad: si no, se corrige una fecha en
     la hoja, se vuelve al portafolio y sale igual que antes (D-120). */
  if (forzar) {
    ['Solicitudes', 'Proyectos'].forEach(function (t) {
      try { invalidarTabla_(t); } catch (e) { /* una hoja que no esta no estorba */ }
    });
    return planoParaElNavegador_(calcularPortafolio_());
  }
  return conResultadoEnCache_('portafolio', function () {
    return planoParaElNavegador_(calcularPortafolio_());
  }, versionDatos_());
}

/**
 * @return {!Object}
 * @private
 */
function calcularPortafolio_() {
  var datos = cargarDatos_();
  var r = tarjetasDeIniciativas_(datos);
  r.generado = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm');
  r.plataformas = getPlataformas_();
  return r;
}

/**
 * De que plataforma es cada iniciativa, y de donde salio ese dato.
 *
 * Esta en una funcion aparte porque DOS bloques del informe la necesitan —la
 * tabla por plataforma y las tarjetas— y con la deduccion escrita dos veces las
 * dos secciones de la MISMA pagina podrian decir plataformas distintas de la
 * misma iniciativa. Ya tuvimos dos cifras distintas para lo mismo en esta
 * pagina y fue el peor defecto de D-127.
 *
 * @param {!Object} datos
 * @return {!Object} { de: idProyecto -> {plat, como, tocadas}, origen: conteos }
 * @private
 */
function plataformaDeIniciativas_(datos) {
  // iniciativa -> { plataformas que tocan sus solicitudes }
  var platDeSolicitudes = {};
  datos.solicitudes.forEach(function (s) {
    var p = String(s.Plataforma_ID || '').trim();
    if (!s.ID_Proyecto || !p) return;
    platDeSolicitudes[s.ID_Proyecto] = platDeSolicitudes[s.ID_Proyecto] || {};
    platDeSolicitudes[s.ID_Proyecto][p] = true;
  });

  var de = {}, origen = { declarada: 0, deducida: 0, varias: 0, ninguna: 0 };
  datos.proyectos.forEach(function (p) {
    var declarada = String(p.Plataforma_ID || '').trim();
    var tocadas = Object.keys(platDeSolicitudes[p.ID_Proyecto] || {});
    var plat = '', como = '';

    if (declarada) { plat = declarada; como = 'declarada'; origen.declarada++; }
    else if (tocadas.length === 1) { plat = tocadas[0]; como = 'deducida'; origen.deducida++; }
    else if (tocadas.length > 1) { como = 'varias'; origen.varias++; }
    else { como = 'ninguna'; origen.ninguna++; }

    de[p.ID_Proyecto] = { plat: plat, como: como, tocadas: tocadas };
  });
  return { de: de, origen: origen };
}

/**
 * Una tarjeta por iniciativa, con lo que un comite necesita de un vistazo.
 *
 * Es la vista de PORTAFOLIO: la tabla por plataforma dice cuantas hay y en que
 * estado; esta dice como va cada una. Son el mismo universo de iniciativas y la
 * plataforma sale de la misma funcion (informePlataformaDeIniciativas_), para
 * que las dos secciones de la misma pagina no puedan contradecirse.
 *
 * Tres decisiones que merecen explicacion:
 *
 *  - El AVANCE REAL es el promedio del avance de las solicitudes de la
 *    iniciativa, y es null —no cero— cuando no tiene ninguna: no es que no haya
 *    avanzado, es que todavia no hay con que medirlo. Se reusa el calculo que ya
 *    existe (avanceRealIniciativa_), no se inventa otro.
 *  - El AVANCE ESPERADO necesita las dos fechas. Sin fecha de inicio o sin fecha
 *    fin planeada no hay plan contra el cual comparar, y la tarjeta lo dice en
 *    vez de mostrar un 0 % que se leeria como "va atrasadisima".
 *  - El BLOQUEO de la iniciativa es el de sus solicitudes: una iniciativa no
 *    tiene campo de bloqueo propio. Basta UNA solicitud bloqueada para marcarla,
 *    porque para el comite la pregunta es si hay algo detenido ahi, y la tarjeta
 *    dice cuantas y cuales para que la pregunta siguiente tenga respuesta.
 *
 * @param {!Object} datos
 * @return {!Object}
 * @private
 */
function tarjetasDeIniciativas_(datos) {
  var nombrePlataforma = mapaPlataformas();
  var nombreEstado = mapaEstadosIniciativa();
  var nombrePrioridad = mapaCatalogo_(PRIORIDADES);
  var nombreTipoIni = mapaCatalogo_(getTiposIniciativa_());
  var plataformaDe = plataformaDeIniciativas_(datos);

  /* Las solicitudes de cada iniciativa, separando las estabilizaciones: un
     incidente no es alcance planeado, y contarlo bajaria el avance de la
     iniciativa por algo que no estaba en el plan (D-101). Es el mismo criterio
     de la matriz de iniciativas, para que los dos avances coincidan. */
  var suyas = {}, bloqueadas = {}, estabilizaciones = {}, porEstado = {};
  datos.solicitudes.forEach(function (s) {
    var k = s.ID_Proyecto;
    if (!k) return;
    if (esTipoEstabilizacion(s.Tipo_Solicitud)) {
      estabilizaciones[k] = (estabilizaciones[k] || 0) + 1;
      return;
    }
    (suyas[k] = suyas[k] || []).push(s);
    /* El desglose por estado de las solicitudes: por iniciar, en progreso,
       terminada y las demas. Se cuentan TODOS los estados presentes y no solo
       tres, porque mostrar tres de cinco deja un total que no cuadra y quien
       suma con la calculadora concluye que la tarjeta esta mal. */
    var est = String(s.Estado_Actual || '') || 'SIN_ESTADO';
    porEstado[k] = porEstado[k] || {};
    porEstado[k][est] = (porEstado[k][est] || 0) + 1;
    if (String(s.Estado_Actual) === PORTAFOLIO_ESTADO_BLOQUEADA) {
      (bloqueadas[k] = bloqueadas[k] || []).push({
        id: s.ID_Solicitud, nombre: s.Nombre_Solicitud || s.ID_Solicitud,
        fase: s.Fase_Actual || ''
      });
    }
  });

  /* Un solo instante para todas: el avance esperado se compara siempre contra
     el mismo "hoy". Con dos instantes distintos, dos iniciativas con el mismo
     plan podrian mostrar esperados distintos. */
  var ahora = new Date();

  var tarjetas = datos.proyectos.map(function (p) {
    var d = plataformaDe.de[p.ID_Proyecto] || { plat: '', como: 'ninguna', tocadas: [] };
    var real = avanceRealIniciativa_(suyas[p.ID_Proyecto] || []);
    var esperado = avanceEsperadoIniciativa_(p.Fecha_Inicio, p.Fecha_Fin_Estimada, ahora);
    var trabadas = bloqueadas[p.ID_Proyecto] || [];
    var prioridad = normalizarPrioridad_(p.Prioridad);
    var cuentas = porEstado[p.ID_Proyecto] || {};

    return {
      id: p.ID_Proyecto,
      nombre: p.Nombre_Proyecto || p.ID_Proyecto,
      /* La tarjeta viaja siempre y la pantalla decide si la muestra. No se
         filtra aqui porque la ficha de una iniciativa se abre desde su tarjeta:
         escondida en el servidor, una iniciativa desactivada por error no
         tendria desde donde volver a activarse. */
      activa: iniciativaActiva(p),
      estado: p.Estado_Iniciativa || '',
      estadoNombre: nombreEstado[p.Estado_Iniciativa] || 'Sin estado',
      prioridad: prioridad,
      prioridadNombre: nombrePrioridad[prioridad] || (p.Prioridad || 'Sin prioridad'),
      tipo: p.Tipo_Iniciativa || '',
      tipoNombre: nombreTipoIni[p.Tipo_Iniciativa] || 'Sin tipo',
      plataformaId: d.plat,
      plataforma: d.como === 'varias'
        ? d.tocadas.map(function (k) { return nombrePlataforma[k] || k; }).join(' · ')
        : (nombrePlataforma[d.plat] || 'Sin plataforma'),
      origenPlataforma: d.como,
      fechaInicio: p.Fecha_Inicio || null,
      fechaFinPlaneada: p.Fecha_Fin_Estimada || null,
      fechaFinReal: p.Fecha_Fin_Real || null,
      avanceReal: real,
      avanceEsperado: esperado,
      // La desviacion es la lectura, no los dos porcentajes por separado: lo que
      // decide un comite es si va adelante o atras de su plan, y cuanto.
      desviacion: (real === null || esperado === null) ? null : red_(real - esperado, 1),
      actividades: (suyas[p.ID_Proyecto] || []).length,
      estabilizaciones: estabilizaciones[p.ID_Proyecto] || 0,
      /* Las solicitudes por estado, en el orden del catalogo y solo las que
         tienen alguna: una tarjeta con cinco ceros no informa, informa la que
         dice "3 en progreso, 1 terminada". */
      porEstado: ESTADOS.filter(function (e) { return cuentas[e.id]; })
          .map(function (e) {
            return { estado: e.id, nombre: e.nombre, cuenta: cuentas[e.id] };
          }),
      /* Una iniciativa en pausa sigue contando en el portafolio y no avanza. No
         es un error —el negocio puede pausarla a proposito— pero una pausa que
         nadie recuerda es un compromiso detenido, y la tarjeta lo senala. */
      enPausa: String(p.Estado_Iniciativa) === PORTAFOLIO_ESTADO_PAUSA,
      tieneBloqueo: trabadas.length > 0,
      bloqueadas: trabadas.length,
      detalleBloqueo: trabadas,
      // Por que no se puede calcular el esperado, dicho en la tarjeta: "sin
      // fechas" es accionable, un 0 % silencioso no.
      faltaFechaInicio: !aFecha_(p.Fecha_Inicio),
      faltaFechaFin: !aFecha_(p.Fecha_Fin_Estimada)
    };
  });

  /* Orden: por FECHA FIN PLANEADA ascendente, que es lo que un comite quiere
     ver primero —lo que vence antes—, y a igualdad por fecha de inicio. Las que
     no tienen fecha van al final, no al principio: una iniciativa sin plan no es
     la mas urgente, es la que le falta el plan, y va con su propio aviso. */
  tarjetas.sort(function (a, b) {
    var fa = aFecha_(a.fechaFinPlaneada), fb = aFecha_(b.fechaFinPlaneada);
    if (fa && fb && fa.getTime() !== fb.getTime()) return fa - fb;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    var ia = aFecha_(a.fechaInicio), ib = aFecha_(b.fechaInicio);
    if (ia && ib && ia.getTime() !== ib.getTime()) return ia - ib;
    if (ia && !ib) return -1;
    if (!ia && ib) return 1;
    return String(a.nombre).localeCompare(String(b.nombre));
  });

  /* Los indicadores de arriba cuentan el portafolio ACTIVO, que es el universo
     de esta pantalla. Las inactivas viajan igual —la casilla "ver inactivas"
     las muestra, y desde su tarjeta se vuelve a activar una desactivada por
     error— pero no entran en las cuentas: un tablero que dice 39 iniciativas
     sobre una lista de 35 obliga a buscar las otras cuatro. */
  var activas = tarjetas.filter(function (t) { return t.activa; });

  return {
    tarjetas: tarjetas,
    total: activas.length,
    inactivas: tarjetas.length - activas.length,
    conBloqueo: activas.filter(function (t) { return t.tieneBloqueo; }).length,
    atrasadas: activas.filter(function (t) {
      return t.desviacion !== null && t.desviacion < 0;
    }).length,
    sinPlan: activas.filter(function (t) {
      return t.faltaFechaInicio || t.faltaFechaFin;
    }).length,
    sinActividades: activas.filter(function (t) { return t.avanceReal === null; }).length,
    enPausa: activas.filter(function (t) { return t.enPausa; }).length,
    estados: ESTADOS_INICIATIVA,
    // Los estados de SOLICITUD, para que la pantalla pueda rotular el desglose
    // sin tener que conocer el catalogo.
    estadosSolicitud: ESTADOS,
    prioridades: PRIORIDADES,
    tipos: getTiposIniciativa_()
  };
}
