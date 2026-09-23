/**
 * Config.gs
 * Punto unico de configuracion del Sistema de Gestion de Proyectos e Iniciativas.
 * Gerencia de Desarrollo de Plataformas Digitales.
 *
 * Los identificadores volatiles (IDs de libros, plantilla, webhook) NO se escriben
 * aqui en duro: se guardan en PropertiesService del script para poder rotarlos sin
 * tocar el codigo. Las constantes de este archivo son solo valores por defecto y
 * parametros estables.
 */

/** Claves usadas en PropertiesService (Script Properties). */
var PROP_KEYS = {
  LIBRO_PARAMETRIZACION: 'ID_LIBRO_PARAMETRIZACION',
  LIBRO_TRANSACCIONAL: 'ID_LIBRO_TRANSACCIONAL',
  PLANTILLA_REQUERIMIENTO: 'ID_PLANTILLA_REQUERIMIENTO',
  CHAT_WEBHOOK_URL: 'CHAT_WEBHOOK_URL',
  DOMINIO_CORPORATIVO: 'DOMINIO_CORPORATIVO'
};

var CONFIG = {
  /** Nombre visible de la aplicacion en el navbar y en los correos. */
  APP_NOMBRE: 'Gestion de Plataformas Digitales',
  APP_SUBTITULO: 'Gestion de Proyectos, Iniciativas y Demandas Digitales',

  /** Zona horaria y formatos. Decision tomada: America/Bogota. */
  ZONA_HORARIA: 'America/Bogota',
  FORMATO_FECHA_HORA: 'dd/MM/yyyy HH:mm',
  FORMATO_FECHA: 'dd/MM/yyyy',

  /** Unidad Compartida raiz donde se crean las carpetas por solicitud. */
  DRIVE_UNIDAD_RAIZ_ID: '1ib9cr7o47ecPQ3KSpcAn_mBjiY9LzqaY',

  /** Nombres de los libros que crea/abre setupInicial(). */
  NOMBRE_LIBRO_PARAMETRIZACION: 'Parametrizacion_Plataformas_Completo',
  NOMBRE_LIBRO_TRANSACCIONAL: 'Gestion_Proyectos_Plataformas',

  /** Nombre del Google Doc maestro que se clona por cada solicitud. */
  NOMBRE_PLANTILLA_REQUERIMIENTO: 'Plantilla_Formato_Requerimiento',

  /** Prefijo del ID de solicitud: SOL-YYYYMMDD-XXX */
  PREFIJO_SOLICITUD: 'SOL',

  /**
   * Formato sugerido de version semantica (ej. v2.4.0). Es una referencia para
   * quien registra el roadmap, no una regla que bloquee: la version valida es
   * la que exista en Roadmap_Versiones, se escriba como se escriba.
   */
  REGEX_VERSION_SEMANTICA: /^v\d+\.\d+\.\d+$/,

  /** Paleta corporativa (espejo del tema Tailwind del frontend). */
  COLORES: {
    NAVY: '#00306E',
    ESMERALDA: '#1DD982',
    VERDE_OSCURO: '#1BB26C',
    MENTA: '#50EAA2',
    BLANCO: '#FFFFFF'
  },

  /** Interruptores de integraciones: permiten desplegar sin Chat/Gmail listos. */
  NOTIFICAR_CHAT: true,
  NOTIFICAR_CORREO: true,

  /**
   * Segundos que las lecturas de Sheets permanecen en memoria compartida.
   * Toda escritura invalida la tabla afectada, asi que subirlo no produce
   * datos viejos: solo evita releer lo mismo. En 0 se desactiva la cache.
   */
  CACHE_SEGUNDOS: 300,

  /** Modo diagnostico: escribe trazas en Logger ante cada transicion. */
  DEBUG: false
};

/* ------------------------------------------------------------------ */
/* Accesores de configuracion                                          */
/* ------------------------------------------------------------------ */

/**
 * Lee una propiedad del script.
 * @param {string} clave Una de PROP_KEYS.
 * @param {boolean} obligatoria Si es true lanza error cuando no esta configurada.
 * @return {string}
 */
function getProp(clave, obligatoria) {
  var valor = PropertiesService.getScriptProperties().getProperty(clave);
  if (!valor && obligatoria) {
    throw new Error(
      'Configuracion faltante: "' + clave + '". Ejecute setupInicial() o ' +
      'registre el valor con guardarConfiguracion().'
    );
  }
  return valor || '';
}

/**
 * Guarda uno o varios valores de configuracion.
 * @param {!Object<string,string>} valores Mapa clave (PROP_KEYS) -> valor.
 */
function guardarConfiguracion(valores) {
  PropertiesService.getScriptProperties().setProperties(valores, false);
}

/** @return {string} ID del libro de parametrizacion (maestros). */
function getIdLibroParametrizacion() {
  return getProp(PROP_KEYS.LIBRO_PARAMETRIZACION, true);
}

/** @return {string} ID del libro transaccional (solicitudes/auditoria). */
function getIdLibroTransaccional() {
  return getProp(PROP_KEYS.LIBRO_TRANSACCIONAL, true);
}

/** @return {string} ID del Google Doc plantilla de requerimiento. */
function getIdPlantillaRequerimiento() {
  return getProp(PROP_KEYS.PLANTILLA_REQUERIMIENTO, true);
}

/** @return {string} URL del webhook de Google Chat ('' si no esta configurado). */
function getChatWebhookUrl() {
  return getProp(PROP_KEYS.CHAT_WEBHOOK_URL, false);
}

/** @return {string} Dominio corporativo autorizado ('' = sin restriccion). */
function getDominioCorporativo() {
  return getProp(PROP_KEYS.DOMINIO_CORPORATIVO, false);
}

/**
 * Devuelve el estado de la configuracion para el panel de Administracion.
 * @return {!Object} Diagnostico legible de que esta y que falta.
 */
function diagnosticoConfiguracion() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var idParam = props[PROP_KEYS.LIBRO_PARAMETRIZACION] || null;
  var idTrans = props[PROP_KEYS.LIBRO_TRANSACCIONAL] || null;
  var idPlantilla = props[PROP_KEYS.PLANTILLA_REQUERIMIENTO] || null;

  var diagnostico = {
    libroParametrizacion: idParam,
    libroTransaccional: idTrans,
    plantillaRequerimiento: idPlantilla,
    chatWebhookConfigurado: !!props[PROP_KEYS.CHAT_WEBHOOK_URL],
    dominioCorporativo: props[PROP_KEYS.DOMINIO_CORPORATIVO] || null,
    unidadCompartidaRaiz: CONFIG.DRIVE_UNIDAD_RAIZ_ID,
    zonaHoraria: CONFIG.ZONA_HORARIA,
    // Enlaces directos, para no tener que buscar los archivos en Drive.
    urlLibroParametrizacion: idParam ? 'https://docs.google.com/spreadsheets/d/' + idParam : null,
    urlLibroTransaccional: idTrans ? 'https://docs.google.com/spreadsheets/d/' + idTrans : null,
    urlPlantilla: idPlantilla ? 'https://docs.google.com/document/d/' + idPlantilla : null,
    pendientes: []
  };

  if (!idParam || !idTrans) diagnostico.pendientes.push('Ejecutar setupInicial().');
  if (!idPlantilla) diagnostico.pendientes.push('No existe la plantilla de requerimiento.');
  if (!props[PROP_KEYS.CHAT_WEBHOOK_URL]) {
    diagnostico.pendientes.push('Falta la URL del webhook de Google Chat.');
  }
  if (!props[PROP_KEYS.DOMINIO_CORPORATIVO]) {
    diagnostico.pendientes.push('Falta el dominio corporativo: el acceso no esta restringido.');
  }
  if (!diagnostico.pendientes.length) diagnostico.pendientes.push('Nada pendiente.');

  // Sin esta traza, ejecutar la funcion desde el editor no muestra nada.
  Logger.log(JSON.stringify(diagnostico, null, 2));
  return diagnostico;
}
