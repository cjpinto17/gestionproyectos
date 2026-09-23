/**
 * Rbac.gs
 * Control de acceso basado en roles. Traduce la matriz del documento funcional
 * (seccion 2.2) a reglas ejecutables: que fases puede operar cada rol, que campos
 * puede editar y que transiciones puede ejecutar.
 *
 * DECISION DE DISENO (confirmada con el negocio):
 *  - El retroceso de fase (ej. Pruebas QA -> Desarrollo por hallazgos) esta
 *    permitido para CUALQUIER rol que tenga permiso de edicion sobre la fase
 *    DESTINO. Siempre queda registrado en Auditoria_Transiciones.
 */

/** Comodin que habilita todas las fases o todos los campos. */
var TODAS = '*';

/**
 * Matriz de permisos por rol.
 *  - fases: fases sobre las que el rol puede editar y soltar tarjetas.
 *  - campos: campos de Solicitudes que el rol puede modificar.
 *  - override: ignora toda restriccion de fase/campo (superusuario).
 */
var MATRIZ_PERMISOS = {
  'RO-01': { // Solicitante
    fases: ['FAS-01'],
    campos: ['Nombre_Solicitud', 'Objetivo', 'Entregable', 'ID_Proyecto',
             'Plataforma_ID', 'Tipo_Solicitud', 'Prioridad', 'Proceso_Impactado'],
    override: false
  },
  'RO-02': { // Product Owner - aprobador unico de los pasos clave
    fases: TODAS,
    campos: TODAS,
    override: false
  },
  'RO-03': { // Analista Fabrica
    fases: ['FAS-02', 'FAS-03'],
    campos: ['Fecha_Inicio_Analisis', 'Fecha_Fin_Analisis', 'Responsable_ID',
             'Tiene_Bloqueo', 'Causal_Bloqueo'],
    override: false
  },
  'RO-04': { // Desarrollador
    fases: ['FAS-04'],
    campos: ['Fecha_Inicio_Dev', 'Fecha_Fin_Dev', 'Version_Semantica',
             'Tiene_Bloqueo', 'Causal_Bloqueo'],
    override: false
  },
  'RO-05': { // Analista QA
    fases: ['FAS-05'],
    campos: ['Fecha_Inicio_QA', 'Fecha_Fin_QA', 'Tiene_Bloqueo', 'Causal_Bloqueo'],
    override: false
  },
  'RO-06': { // Equipo UAT
    fases: ['FAS-06'],
    campos: ['Fecha_Inicio_UAT', 'Fecha_Fin_UAT', 'Tiene_Bloqueo', 'Causal_Bloqueo'],
    override: false
  },
  'RO-07': { // Comite CAB / Presidencia
    fases: ['FAS-07', 'FAS-08'],
    campos: ['Fecha_Socializacion', 'Fecha_Despliegue', 'Estado_Actual'],
    override: false
  },
  'RO-08': { // Administrador TI / Gerente
    fases: TODAS,
    campos: TODAS,
    override: true
  },
  'RO-10': { // PM de la Fabrica de Software: coordina la ejecucion y mantiene
             // al dia los datos de las solicitudes en todas las fases.
    fases: TODAS,
    campos: TODAS,
    override: false
  },
  'RO-11': { // Lider de proyecto de Fabrica de Software
    fases: TODAS,
    campos: TODAS,
    override: false
  },
  'RO-09': { // Business Owner: duena de la iniciativa en el negocio.
             // Registra demanda y consulta todo, pero no opera el embudo.
    fases: ['FAS-01'],
    campos: ['Nombre_Solicitud', 'Objetivo', 'Entregable', 'ID_Proyecto',
             'Plataforma_ID', 'Tipo_Solicitud', 'Prioridad', 'Proceso_Impactado'],
    override: false
  }
};

/** Roles autorizados para administrar catalogos maestros (pagina Admin). */
var ROLES_ADMIN = ['RO-08'];

/**
 * Roles que pueden mover tarjetas en el tablero y marcar bloqueos.
 * Para los demas, la pagina de Gestion es de solo lectura: ven todo el estado
 * del embudo pero no lo alteran. El avance del flujo lo gobierna el Product
 * Owner, que es el aprobador de los pasos clave.
 */
var ROLES_OPERAN_TABLERO = ['RO-02', 'RO-08'];

/**
 * @param {string} rolId
 * @return {boolean} True si el rol puede cambiar de fase y bloquear.
 */
function puedeOperarTablero(rolId) {
  return ROLES_OPERAN_TABLERO.indexOf(rolId) !== -1;
}

/**
 * Roles que pueden editar los datos de una solicitud ya creada.
 * Mover la tarjeta y editar su contenido son cosas distintas: la fabrica
 * mantiene al dia fechas, version y responsables sin gobernar el avance del
 * embudo, que sigue siendo del Product Owner.
 */
var ROLES_EDITAN_SOLICITUD = ['RO-02', 'RO-08', 'RO-10', 'RO-11'];

/**
 * @param {string} rolId
 * @return {boolean}
 */
function puedeEditarSolicitud(rolId) {
  return ROLES_EDITAN_SOLICITUD.indexOf(rolId) !== -1;
}

/**
 * @param {string} rolId
 * @return {!Object} Permisos del rol; por defecto, sin acceso.
 */
function getPermisos(rolId) {
  return MATRIZ_PERMISOS[rolId] || { fases: [], campos: [], override: false };
}

/**
 * @param {string} rolId
 * @param {string} faseId
 * @return {boolean} True si el rol puede editar tarjetas en esa fase.
 */
function puedeEditarFase(rolId, faseId) {
  var p = getPermisos(rolId);
  if (p.override || p.fases === TODAS) return true;
  return p.fases.indexOf(faseId) !== -1;
}

/**
 * @param {string} rolId
 * @param {string} campo Nombre de columna de Solicitudes.
 * @return {boolean}
 */
function puedeEditarCampo(rolId, campo) {
  var p = getPermisos(rolId);
  if (p.override || p.campos === TODAS) return true;
  return p.campos.indexOf(campo) !== -1;
}

/** @return {boolean} True si el rol administra catalogos maestros. */
function esAdministrador(rolId) {
  return ROLES_ADMIN.indexOf(rolId) !== -1;
}

/** @return {number} Orden (1..8) de una fase, o -1 si no existe. */
function ordenDeFase(faseId) {
  for (var i = 0; i < FASES.length; i++) {
    if (FASES[i].id === faseId) return FASES[i].orden;
  }
  return -1;
}

/**
 * Evalua si un rol puede mover una solicitud entre dos fases.
 * Reglas:
 *  1. El administrador siempre puede (override).
 *  2. Avanzar: requiere permiso de edicion sobre la fase ORIGEN.
 *  3. Retroceder: requiere permiso de edicion sobre la fase DESTINO.
 *  4. No se permite saltar mas de una fase hacia adelante, salvo override.
 *
 * @param {string} rolId
 * @param {string} faseOrigen
 * @param {string} faseDestino
 * @return {{permitido: boolean, motivo: string}}
 */
function validarTransicion(rolId, faseOrigen, faseDestino) {
  if (!puedeOperarTablero(rolId)) {
    return { permitido: false,
             motivo: 'Solo el Product Owner y el Administrador pueden mover tarjetas. ' +
                     'Para su rol, el tablero es de consulta.' };
  }

  var p = getPermisos(rolId);
  if (p.override) return { permitido: true, motivo: '' };

  var oOrigen = ordenDeFase(faseOrigen);
  var oDestino = ordenDeFase(faseDestino);
  if (oOrigen === -1 || oDestino === -1) {
    return { permitido: false, motivo: 'Fase de origen o destino no valida.' };
  }
  if (oOrigen === oDestino) {
    return { permitido: false, motivo: 'La solicitud ya se encuentra en esa fase.' };
  }

  if (oDestino > oOrigen) {
    if (oDestino - oOrigen > 1) {
      return { permitido: false, motivo: 'No se permite saltar fases. Solo el Administrador puede hacerlo.' };
    }
    if (!puedeEditarFase(rolId, faseOrigen)) {
      return { permitido: false, motivo: 'Su rol no tiene permiso de edicion sobre la fase de origen.' };
    }
    return { permitido: true, motivo: '' };
  }

  // Retroceso: se valida contra la fase destino.
  if (!puedeEditarFase(rolId, faseDestino)) {
    return { permitido: false, motivo: 'Su rol no tiene permiso de edicion sobre la fase de destino.' };
  }
  return { permitido: true, motivo: '' };
}
