/**
 * Migracion.gs
 * Alta de solicitudes con todos sus datos, reservada al Administrador.
 *
 * El formulario normal de la aplicacion registra demanda nueva: siempre entra
 * en la fase 1, con fecha de hoy y sin historia. Para traer al sistema el
 * trabajo que ya venia corriendo en otra fuente hace falta lo contrario: poder
 * fijar la fase, el estado, las estampas de tiempo de cada etapa y hasta la
 * fecha de registro original.
 *
 * Eso es exactamente lo que no debe poder hacer un usuario cualquiera, porque
 * permite escribir historia. Por eso vive aparte y exige rol Administrador.
 */

/** Campos que calcula el sistema y no se piden en el formulario. */
var CAMPOS_NO_MIGRABLES = ['Carpeta_Drive_URL', 'Fecha_Ultimo_Cambio'];

/**
 * Devuelve la definicion del formulario de migracion: las columnas de
 * Solicitudes que se pueden capturar, con sus listas desplegables resueltas.
 * @return {!Object}
 */
function getFormularioMigracion() {
  exigirAdministrador_();
  var info = getDefinicionTabla('Solicitudes');
  var columnas = info.def.columnas.filter(function (c) {
    return CAMPOS_NO_MIGRABLES.indexOf(c.campo) === -1;
  });
  return {
    columnas: columnas,
    opciones: opcionesDeReferencia_(columnas),
    // Valores por defecto pensados para migrar: entra al backlog, por iniciar.
    valoresPorDefecto: { Fase_Actual: 'FAS-02', Estado_Actual: 'EST-01', Tiene_Bloqueo: 'NO' }
  };
}

/**
 * Crea una solicitud con los datos tal como vienen de la fuente original.
 *
 * @param {!Object} datos Campos de la solicitud. ID_Solicitud es opcional: si
 *     no viene, se genera; si viene, se respeta para conservar el codigo que ya
 *     usaba el negocio.
 * @param {!Object=} opciones { notificar: boolean }. La migracion nunca crea
 *     carpetas en Drive: trae informacion que ya vive en otra parte.
 * @return {!Object} { ok, idSolicitud, avisos }
 */
function migrarSolicitud(datos, opciones) {
  var ctx = exigirAdministrador_();
  var op = opciones || {};

  return conBloqueo_(function () {
    var avisos = [];
    var id = String(datos.ID_Solicitud || '').trim() || generarIdSolicitud_();

    if (!buscarPorPk_('Proyectos', datos.ID_Proyecto)) {
      throw new Error('La iniciativa ' + datos.ID_Proyecto + ' no existe.');
    }
    if (buscarPorPk_('Solicitudes', id)) {
      throw new Error('Ya existe una solicitud con el codigo ' + id + '.');
    }

    var bloqueo = String(datos.Tiene_Bloqueo || 'NO').toUpperCase().indexOf('S') === 0 ? 'SI' : 'NO';
    if (bloqueo === 'SI' && !datos.Causal_Bloqueo) {
      throw new Error('Marco la solicitud con bloqueo: indique la causal.');
    }

    var registro = {
      ID_Solicitud: id,
      // La fecha de registro es la de la fuente original, no la de hoy: de ella
      // dependen el Lead Time y todos los indicadores de antiguedad.
      Fecha_Registro: aFechaOpcional_(datos.Fecha_Registro) || new Date(),
      Nombre_Solicitud: String(datos.Nombre_Solicitud || '').trim(),
      Objetivo: datos.Objetivo || '',
      Entregable: datos.Entregable || '',
      ID_Proyecto: datos.ID_Proyecto || '',
      Plataforma_ID: datos.Plataforma_ID || '',
      Solicitante_ID: datos.Solicitante_ID || ctx.idUsuario,
      Tipo_Solicitud: datos.Tipo_Solicitud || '',
      Prioridad: datos.Prioridad || '',
      Orden_Iniciativa: datos.Orden_Iniciativa ||
                        siguienteOrdenIniciativa_(datos.ID_Proyecto),
      Proceso_Impactado: datos.Proceso_Impactado || '',
      Doc_Requerimiento_URL: String(datos.Doc_Requerimiento_URL || '').trim(),
      Carpeta_Drive_URL: '',
      Fase_Actual: datos.Fase_Actual || 'FAS-02',
      Estado_Actual: datos.Estado_Actual || 'EST-01',
      Tiene_Bloqueo: bloqueo,
      Causal_Bloqueo: bloqueo === 'SI' ? datos.Causal_Bloqueo : '',
      Link_Taiga: datos.Link_Taiga || '',
      Version_Semantica: datos.Version_Semantica || '',
      Responsable_ID: datos.Responsable_ID || '',
      Fecha_Inicio_Analisis: aFechaOpcional_(datos.Fecha_Inicio_Analisis),
      Fecha_Fin_Analisis: aFechaOpcional_(datos.Fecha_Fin_Analisis),
      Fecha_Inicio_Dev: aFechaOpcional_(datos.Fecha_Inicio_Dev),
      Fecha_Fin_Dev: aFechaOpcional_(datos.Fecha_Fin_Dev),
      Fecha_Inicio_QA: aFechaOpcional_(datos.Fecha_Inicio_QA),
      Fecha_Fin_QA: aFechaOpcional_(datos.Fecha_Fin_QA),
      Fecha_Inicio_UAT: aFechaOpcional_(datos.Fecha_Inicio_UAT),
      Fecha_Fin_UAT: aFechaOpcional_(datos.Fecha_Fin_UAT),
      Fecha_Socializacion: aFechaOpcional_(datos.Fecha_Socializacion),
      Fecha_Despliegue: aFechaOpcional_(datos.Fecha_Despliegue),
      // El reloj de la fase corre desde el ultimo movimiento conocido, no desde
      // la migracion: de lo contrario toda la carga apareceria recien tocada.
      Fecha_Ultimo_Cambio: ultimoMovimiento_(datos) || aFechaOpcional_(datos.Fecha_Registro) || new Date()
    };

    validarRegistro_('Solicitudes', registro, true);

    agregarFila_('Solicitudes', registro);

    // Queda constancia de que la solicitud entro migrada y en que fase lo hizo.
    registrarTransicionAudit({
      idSolicitud: id,
      faseOrigen: '',
      faseDestino: registro.Fase_Actual,
      estadoOrigen: '',
      estadoDestino: registro.Estado_Actual,
      desde: registro.Fecha_Ultimo_Cambio,
      correoUsuario: ctx.correo + ' (migracion)'
    });

    if (op.notificar) avisos = avisos.concat(notificar_(registro, 'creacion'));

    return { ok: true, idSolicitud: id, avisos: avisos };
  });
}

/**
 * Convierte a fecha lo que venga del formulario, respetando el horario local
 * (ver aFechaDeFormulario_); devuelve '' si venia vacio.
 * @private
 */
function aFechaOpcional_(valor) {
  return aFechaDeFormulario_(valor);
}

/**
 * La estampa mas reciente entre las etapas informadas. Sirve para que el
 * indicador de antiguedad en fase parta del ultimo movimiento real.
 * @private
 */
function ultimoMovimiento_(datos) {
  var candidatas = ['Fecha_Despliegue', 'Fecha_Socializacion', 'Fecha_Fin_UAT', 'Fecha_Inicio_UAT',
                    'Fecha_Fin_QA', 'Fecha_Inicio_QA', 'Fecha_Fin_Dev', 'Fecha_Inicio_Dev',
                    'Fecha_Fin_Analisis', 'Fecha_Inicio_Analisis'];
  var mayor = null;
  candidatas.forEach(function (campo) {
    var d = aFecha_(datos[campo]);
    if (d && (!mayor || d > mayor)) mayor = d;
  });
  return mayor;
}
