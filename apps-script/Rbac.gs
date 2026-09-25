/**
 * Rbac.gs
 * Control de acceso basado en roles.
 *
 * COMO FUNCIONA (D-68)
 * --------------------
 * Hay UNA sola pregunta: tienePermiso(rolId, permiso). Todo lo demas —que
 * pestanas ve alguien, si puede mover una tarjeta, si puede editar una
 * iniciativa— es esa pregunta con distinto nombre de permiso.
 *
 * La respuesta sale de dos hojas que se editan desde Administracion:
 *   - Permisos_Rol   una fila por rol, una columna SI/NO por permiso.
 *   - Permisos_Fase  la cuadricula rol x fase del embudo.
 *
 * Si esas hojas todavia no existen —instalacion nueva, o antes de correr
 * actualizarEstructura()— se usan los valores de fabrica de este archivo, que
 * reproducen exactamente el comportamiento anterior. La aplicacion nunca se
 * queda sin reglas.
 *
 * QUE HABIA ANTES, Y POR QUE SE CAMBIO
 * ------------------------------------
 * Los permisos vivian en cinco listas sueltas mas una matriz por rol. La matriz
 * decia, por ejemplo, que el Analista QA operaba la fase Pruebas QA y podia
 * tocar sus fechas. No era cierto: la regla de fases solo se consultaba despues
 * de un portero que dejaba pasar unicamente a Product Owner y Administrador, y
 * la regla de campos vivia en una funcion que nadie llamaba. Toda esa matriz
 * era decorativa. Ahora lo que esta escrito es lo que se aplica.
 *
 * DECISION DE DISENO (confirmada con el negocio):
 *  - El retroceso de fase (ej. Pruebas QA -> Desarrollo por hallazgos) se valida
 *    contra la fase DESTINO, no la de origen. Siempre queda en la bitacora.
 */

/**
 * Los permisos que existen, en el orden en que se muestran en Administracion.
 * Agregar uno aqui y en el esquema basta para que aparezca en la pantalla.
 */
var CATALOGO_PERMISOS = [
  { grupo: 'Menú principal', campo: 'Ver_Home', nombre: 'Home' },
  { grupo: 'Menú principal', campo: 'Ver_Iniciativas', nombre: 'Iniciativas' },
  { grupo: 'Menú principal', campo: 'Ver_Gestion', nombre: 'Gestión fábrica' },
  { grupo: 'Menú principal', campo: 'Ver_Roadmap', nombre: 'Roadmap' },
  { grupo: 'Menú principal', campo: 'Ver_Reportes', nombre: 'Reportes' },
  { grupo: 'Menú principal', campo: 'Administrar', nombre: 'Administración' },

  { grupo: 'Iniciativas', campo: 'Editar_Iniciativa', nombre: 'Editar la ficha' },
  { grupo: 'Iniciativas', campo: 'Comentar_Iniciativa', nombre: 'Comentar' },

  { grupo: 'Gestión fábrica', campo: 'Crear_Solicitud', nombre: 'Crear solicitud' },
  { grupo: 'Gestión fábrica', campo: 'Editar_Solicitud', nombre: 'Editar solicitud' },
  { grupo: 'Gestión fábrica', campo: 'Mover_Fase', nombre: 'Mover de fase' },
  { grupo: 'Gestión fábrica', campo: 'Retroceder_Fase', nombre: 'Devolver a fase anterior' },
  { grupo: 'Gestión fábrica', campo: 'Saltar_Fases', nombre: 'Saltar fases' },
  { grupo: 'Gestión fábrica', campo: 'Bloquear_Solicitud', nombre: 'Marcar y levantar bloqueos' },
  { grupo: 'Gestión fábrica', campo: 'Comentar_Solicitud', nombre: 'Comentar' },
  { grupo: 'Gestión fábrica', campo: 'Migrar_Solicitud', nombre: 'Migrar históricas' },

  { grupo: 'Roadmap', campo: 'Gestionar_Versiones', nombre: 'Crear y editar versiones' }
];

/** Permiso sin el cual nadie puede quedarse: si no, el sistema queda sin duena. */
var PERMISO_ADMINISTRAR = 'Administrar';

/**
 * Valores de fabrica. Reproducen EXACTAMENTE lo que la aplicacion hacia antes
 * de que los permisos fueran configurables, para que la migracion no le quite
 * el acceso a nadie. Desde Administracion se cambian sin tocar el codigo.
 *
 * Lectura rapida de lo que habia:
 *   - Todas las pestanas menos Administracion las veia todo el mundo.
 *   - Crear solicitudes y comentar no estaban restringidos en absoluto.
 *   - Mover tarjetas y bloquear: solo Product Owner y Administrador.
 *   - Editar solicitud: PO, Administrador, PM y Lider de la fabrica.
 *   - Editar iniciativa: PO y Administrador.
 *   - Versiones del roadmap: Administrador y Lider de la fabrica.
 *   - Saltar fases y migrar historicas: solo el Administrador.
 */
var PERMISOS_DE_FABRICA = {
  'RO-01': { menu: true },                                        // Solicitante
  'RO-02': { menu: true, iniciativa: true, embudo: true },        // Product Owner
  'RO-03': { menu: true },                                        // Analista Fabrica
  'RO-04': { menu: true },                                        // Desarrollador
  'RO-05': { menu: true },                                        // Analista QA
  'RO-06': { menu: true },                                        // Equipo UAT
  'RO-07': { menu: true },                                        // Comite CAB
  'RO-08': { menu: true, iniciativa: true, embudo: true,          // Administrador
             admin: true, versiones: true },
  'RO-09': { menu: true },                                        // Business Owner
  'RO-10': { menu: true, editaSolicitud: true },                  // PM Fabrica SW
  'RO-11': { menu: true, editaSolicitud: true, versiones: true }  // Lider proyecto FS
};

/**
 * Fases de fabrica por rol.
 *
 * Vienen de la matriz original del documento funcional, que nunca llego a
 * aplicarse. Se conservan porque describen bien quien trabaja en que parte del
 * embudo: con marcarle "Mover de fase" al Analista QA, queda operando su fase y
 * ninguna otra, sin tener que armar la cuadricula desde cero.
 */
var FASES_DE_FABRICA = {
  'RO-01': ['FAS-01'],
  'RO-02': TODAS_LAS_FASES_(),
  'RO-03': ['FAS-02', 'FAS-03'],
  'RO-04': ['FAS-04'],
  'RO-05': ['FAS-05'],
  'RO-06': ['FAS-06'],
  'RO-07': ['FAS-07', 'FAS-08'],
  'RO-08': TODAS_LAS_FASES_(),
  'RO-09': ['FAS-01'],
  'RO-10': TODAS_LAS_FASES_(),
  'RO-11': TODAS_LAS_FASES_()
};

/** @return {!Array<string>} Los ocho identificadores de fase. @private */
function TODAS_LAS_FASES_() {
  return ['FAS-01', 'FAS-02', 'FAS-03', 'FAS-04',
          'FAS-05', 'FAS-06', 'FAS-07', 'FAS-08'];
}

/**
 * Traduce un renglon de PERMISOS_DE_FABRICA a la fila completa de permisos.
 * @param {string} rolId
 * @return {!Object<string,boolean>}
 * @private
 */
function permisosDeFabrica_(rolId) {
  var f = PERMISOS_DE_FABRICA[rolId] || {};
  return {
    Ver_Home: !!f.menu,
    Ver_Iniciativas: !!f.menu,
    Ver_Gestion: !!f.menu,
    Ver_Roadmap: !!f.menu,
    Ver_Reportes: !!f.menu,
    Administrar: !!f.admin,
    Editar_Iniciativa: !!f.iniciativa,
    // Comentar y crear solicitudes no estaban restringidos: cualquiera con
    // sesion podia hacerlo. Se conserva tal cual para no quitarle a nadie algo
    // que hoy usa; quien quiera cerrarlo lo hace desde Administracion.
    Comentar_Iniciativa: !!f.menu,
    Crear_Solicitud: !!f.menu,
    Comentar_Solicitud: !!f.menu,
    Editar_Solicitud: !!(f.embudo || f.admin || f.editaSolicitud),
    Mover_Fase: !!f.embudo,
    Retroceder_Fase: !!f.embudo,
    // Saltar fases y migrar eran exclusivos del Administrador.
    Saltar_Fases: !!f.admin,
    Migrar_Solicitud: !!f.admin,
    Bloquear_Solicitud: !!f.embudo,
    Gestionar_Versiones: !!f.versiones
  };
}

/* ================================================================== */
/* Lectura de los permisos vigentes                                    */
/* ================================================================== */

/**
 * Los permisos de un rol: de la hoja si existe, de fabrica si no.
 *
 * @param {string} rolId
 * @return {!Object<string,boolean>}
 * @private
 */
function permisosDeRol_(rolId) {
  if (!rolId) return permisosDeFabrica_('');
  var fila = filaDePermisos_('Permisos_Rol', rolId);
  if (!fila) return permisosDeFabrica_(rolId);

  var permisos = {};
  CATALOGO_PERMISOS.forEach(function (p) {
    permisos[p.campo] = esSi_(fila[p.campo]);
  });
  return permisos;
}

/**
 * Busca la fila de un rol en una hoja de permisos. Devuelve null si la hoja no
 * existe todavia o el rol no esta en ella.
 *
 * @param {string} tabla
 * @param {string} rolId
 * @return {?Object}
 * @private
 */
function filaDePermisos_(tabla, rolId) {
  try {
    var filas = leerTabla_(tabla);
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i].Rol_ID) === String(rolId)) return filas[i];
    }
  } catch (e) {
    // La hoja no existe: se cae a los valores de fabrica, que es justo lo que
    // debe pasar en una instalacion que aun no corrio actualizarEstructura().
  }
  return null;
}

/**
 * En la hoja un permiso se escribe SI o NO. Se acepta tambien SÍ con tilde y
 * TRUE, porque Google Sheets convierte solo algunas celdas a booleano.
 * @param {*} valor
 * @return {boolean}
 * @private
 */
function esSi_(valor) {
  if (valor === true) return true;
  var v = String(valor || '').trim().toUpperCase();
  return v === 'SI' || v === 'SÍ' || v === 'TRUE' || v === 'X' || v === '1';
}

/**
 * LA pregunta. Todo el control de acceso pasa por aqui.
 *
 * @param {string} rolId
 * @param {string} permiso Uno de los campos de CATALOGO_PERMISOS.
 * @return {boolean}
 */
function tienePermiso(rolId, permiso) {
  return !!permisosDeRol_(rolId)[permiso];
}

/**
 * Las fases en las que un rol puede mover tarjetas.
 * @param {string} rolId
 * @return {!Array<string>}
 */
function fasesDeRol(rolId) {
  var fila = filaDePermisos_('Permisos_Fase', rolId);
  if (!fila) return (FASES_DE_FABRICA[rolId] || []).slice();

  return TODAS_LAS_FASES_().filter(function (id) {
    return esSi_(fila[id.replace('-', '_')]);
  });
}

/**
 * @param {string} rolId
 * @param {string} faseId
 * @return {boolean} True si el rol puede operar tarjetas en esa fase.
 */
function puedeEditarFase(rolId, faseId) {
  return fasesDeRol(rolId).indexOf(faseId) !== -1;
}

/* ================================================================== */
/* Atajos con nombre, para que las llamadas se lean solas              */
/* ================================================================== */

/** @return {boolean} True si el rol administra catalogos maestros. */
function esAdministrador(rolId) {
  return tienePermiso(rolId, PERMISO_ADMINISTRAR);
}

/** @return {boolean} True si el rol puede mover tarjetas y bloquear. */
function puedeOperarTablero(rolId) {
  return tienePermiso(rolId, 'Mover_Fase');
}

/** @return {boolean} */
function puedeBloquear(rolId) {
  return tienePermiso(rolId, 'Bloquear_Solicitud');
}

/** @return {boolean} */
function puedeCrearSolicitud(rolId) {
  return tienePermiso(rolId, 'Crear_Solicitud');
}

/** @return {boolean} */
function puedeEditarSolicitud(rolId) {
  return tienePermiso(rolId, 'Editar_Solicitud');
}

/** @return {boolean} */
function puedeComentarSolicitud(rolId) {
  return tienePermiso(rolId, 'Comentar_Solicitud');
}

/** @return {boolean} */
function puedeEditarIniciativa(rolId) {
  return tienePermiso(rolId, 'Editar_Iniciativa');
}

/** @return {boolean} */
function puedeComentarIniciativa(rolId) {
  return tienePermiso(rolId, 'Comentar_Iniciativa');
}

/** @return {boolean} */
function puedeGestionarVersiones(rolId) {
  return tienePermiso(rolId, 'Gestionar_Versiones');
}

/** @return {boolean} */
function puedeMigrar(rolId) {
  return tienePermiso(rolId, 'Migrar_Solicitud');
}

/** Permiso de menu que corresponde a cada pagina de la aplicacion. */
var PERMISO_DE_PAGINA = {
  home: 'Ver_Home',
  iniciativas: 'Ver_Iniciativas',
  gestion: 'Ver_Gestion',
  roadmap: 'Ver_Roadmap',
  reportes: 'Ver_Reportes',
  admin: PERMISO_ADMINISTRAR
};

/**
 * @param {string} rolId
 * @param {string} pagina home | iniciativas | gestion | roadmap | reportes | admin
 * @return {boolean}
 */
function puedeVerPagina(rolId, pagina) {
  var permiso = PERMISO_DE_PAGINA[pagina];
  return permiso ? tienePermiso(rolId, permiso) : false;
}

/**
 * Todos los permisos de un rol, para mandarselos al navegador de una vez.
 * @param {string} rolId
 * @return {!Object<string,boolean>}
 */
function getPermisos(rolId) {
  return permisosDeRol_(rolId);
}

/* ================================================================== */
/* Movimiento entre fases                                              */
/* ================================================================== */

/** @return {number} Orden (1..8) de una fase, o -1 si no existe. */
function ordenDeFase(faseId) {
  for (var i = 0; i < FASES.length; i++) {
    if (FASES[i].id === faseId) return FASES[i].orden;
  }
  return -1;
}

/**
 * Evalua si un rol puede mover una solicitud entre dos fases.
 *
 * Reglas, en orden:
 *  1. Sin "Mover de fase" no se mueve nada: el tablero es de consulta.
 *  2. Avanzar exige permiso sobre la fase ORIGEN: se saca de donde se es duena.
 *  3. Retroceder exige ademas "Devolver a fase anterior", y se valida contra la
 *     fase DESTINO: devolver de QA a Desarrollo lo decide quien responde por
 *     Desarrollo.
 *  4. Saltar mas de una fase exige "Saltar fases".
 *
 * @param {string} rolId
 * @param {string} faseOrigen
 * @param {string} faseDestino
 * @return {{permitido: boolean, motivo: string}}
 */
function validarTransicion(rolId, faseOrigen, faseDestino) {
  if (!puedeOperarTablero(rolId)) {
    return { permitido: false,
             motivo: 'Su rol no puede mover solicitudes de fase: el tablero es de consulta.' };
  }

  var oOrigen = ordenDeFase(faseOrigen);
  var oDestino = ordenDeFase(faseDestino);
  if (oOrigen === -1 || oDestino === -1) {
    return { permitido: false, motivo: 'Fase de origen o destino no valida.' };
  }
  if (oOrigen === oDestino) {
    return { permitido: false, motivo: 'La solicitud ya se encuentra en esa fase.' };
  }

  if (oDestino > oOrigen) {
    if (oDestino - oOrigen > 1 && !tienePermiso(rolId, 'Saltar_Fases')) {
      return { permitido: false,
               motivo: 'Su rol no puede saltar fases: mueva la solicitud de una en una.' };
    }
    if (!puedeEditarFase(rolId, faseOrigen)) {
      return { permitido: false,
               motivo: 'Su rol no opera la fase "' + nombreDeFase_(faseOrigen) + '".' };
    }
    return { permitido: true, motivo: '' };
  }

  if (!tienePermiso(rolId, 'Retroceder_Fase')) {
    return { permitido: false,
             motivo: 'Su rol no puede devolver una solicitud a una fase anterior.' };
  }
  if (!puedeEditarFase(rolId, faseDestino)) {
    return { permitido: false,
             motivo: 'Su rol no opera la fase "' + nombreDeFase_(faseDestino) + '", ' +
                     'que es a donde se estaria devolviendo.' };
  }
  return { permitido: true, motivo: '' };
}

/** @return {string} Nombre legible de una fase. @private */
function nombreDeFase_(faseId) {
  for (var i = 0; i < FASES.length; i++) {
    if (FASES[i].id === faseId) return FASES[i].nombre;
  }
  return faseId;
}
