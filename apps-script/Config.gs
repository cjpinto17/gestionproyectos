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
  DOMINIO_CORPORATIVO: 'DOMINIO_CORPORATIVO',
  DOMINIOS_ALIADOS: 'DOMINIOS_ALIADOS',
  URL_APLICACION: 'URL_APLICACION',
  URL_DETECTADA: 'URL_DETECTADA'
};

var CONFIG = {
  /** Nombre visible de la aplicacion en el navbar y en los correos. */
  APP_NOMBRE: 'Gestion de Plataformas Digitales',
  APP_SUBTITULO: 'Gestion de Proyectos, Iniciativas y Demandas Digitales',

  /** Quien construyo la herramienta. Aparece en el pie de pagina. */
  APP_AUTOR: 'Gerencia de Desarrollo de Plataformas Digitales',

  /**
   * Dominios de fuera de la casa que pueden entrar.
   *
   * El dominio propio NO se escribe aqui: se deduce de la cuenta que publica la
   * aplicacion, de modo que no hay forma de equivocarse al teclearlo ni de
   * dejar a toda la compania por fuera con una errata.
   *
   * Esta lista es una segunda cerradura, no la principal: quien decide quien
   * entra sigue siendo la hoja de Usuarios. Sirve para que un correo registrado
   * por error —uno personal, por ejemplo— no alcance a entrar, y para poder
   * decirle a seguridad que la aplicacion rechaza por diseno cualquier correo
   * que no sea de estos dominios.
   */
  DOMINIOS_ALIADOS: ['hexasolutions.co'],

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

  /** Prefijo del ID de solicitud: SOL-0015 */
  PREFIJO_SOLICITUD: 'SOL',

  /**
   * Digitos del consecutivo en el ID de la solicitud. Con cuatro alcanza para
   * 9.999 solicitudes; de ahi en adelante el numero simplemente crece y el ID
   * se alarga, no se reinicia ni se recorta.
   */
  DIGITOS_SOLICITUD: 4,

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
   * Aviso por correo cuando alguien comenta una solicitud o una iniciativa.
   *
   * Va aparte de NOTIFICAR_CORREO porque es de otra naturaleza: los avisos de
   * creacion, avance y bloqueo son hechos del proceso, y un comentario es una
   * conversacion. Si algun dia el equipo lo siente ruidoso, se apaga esto sin
   * perder los otros tres.
   */
  NOTIFICAR_COMENTARIOS: true,

  /**
   * Segundos que las lecturas de Sheets permanecen en memoria compartida.
   * Toda escritura invalida la tabla afectada, asi que subirlo no produce
   * datos viejos: solo evita releer lo mismo. En 0 se desactiva la cache.
   */
  /**
   * Ventana con la que abre el Home, en meses. Debe coincidir con
   * VENTANA_INICIAL de Scripts.html: el servidor la necesita para dejar
   * calientes en cache los indicadores que la primera persona va a pedir.
   */
  VENTANA_HOME_MESES: 3,

  /**
   * Tope de una observacion de seguimiento. No es una restriccion de la hoja
   * sino de la lectura: un seguimiento util se escribe en un parrafo, y una
   * celda con dos paginas de texto no la lee nadie.
   */
  OBSERVACION_MAXIMA: 2000,

  CACHE_SEGUNDOS: 900,

  /**
   * La parametrizacion cambia unas pocas veces al ano, asi que vive mas en
   * cache. Toda escritura desde la aplicacion la invalida igual.
   */
  CACHE_PARAMETRIZACION_SEGUNDOS: 3600,

  /**
   * Cuanto viven los resultados ya calculados (indicadores, matriz, reportes).
   * Tambien se invalidan solos en cada escritura, por el sello de version.
   */
  CACHE_RESULTADOS_SEGUNDOS: 900,

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
function getProp_(clave, obligatoria) {
  var valor = PropertiesService.getScriptProperties().getProperty(clave);
  if (!valor && obligatoria) {
    throw new Error(
      'Configuracion faltante: "' + clave + '". Ejecute setupInicial() o ' +
      'registre el valor con guardarConfiguracion_().'
    );
  }
  return valor || '';
}

/**
 * Guarda uno o varios valores de configuracion.
 * @param {!Object<string,string>} valores Mapa clave (PROP_KEYS) -> valor.
 */
function guardarConfiguracion_(valores) {
  PropertiesService.getScriptProperties().setProperties(valores, false);
}

/** @return {string} ID del libro de parametrizacion (maestros). */
function getIdLibroParametrizacion_() {
  return getProp_(PROP_KEYS.LIBRO_PARAMETRIZACION, true);
}

/** @return {string} ID del libro transaccional (solicitudes/auditoria). */
function getIdLibroTransaccional_() {
  return getProp_(PROP_KEYS.LIBRO_TRANSACCIONAL, true);
}

/** @return {string} ID del Google Doc plantilla de requerimiento. */
function getIdPlantillaRequerimiento_() {
  return getProp_(PROP_KEYS.PLANTILLA_REQUERIMIENTO, true);
}

/** @return {string} URL del webhook de Google Chat ('' si no esta configurado). */
function getChatWebhookUrl_() {
  return getProp_(PROP_KEYS.CHAT_WEBHOOK_URL, false);
}

/**
 * Direccion que se reparte a las personas.
 *
 * Se guarda como propiedad y no se deduce siempre sola, porque la direccion
 * buena puede no ser la de la aplicacion: si esta embebida en un sitio de
 * Google, la que hay que repartir es la del sitio. Si no esta configurada, se
 * usa la de la implementacion activa, que es la que responde en ese momento.
 *
 * @return {string} '' si no hay ninguna disponible.
 */
function getUrlAplicacion_() {
  // Primero lo que alguien escribio a mano; si no, lo que la aplicacion
  // aprendio sola al ser usada. Lo que devuelve ScriptApp aqui NO sirve: desde
  // una ejecucion de fondo puede ser la /dev, que los usuarios no pueden abrir.
  var propia = getProp_(PROP_KEYS.URL_APLICACION, false);
  if (propia && !/\/dev\/?$/.test(propia)) return propia;
  return urlAprendida_();
}

/**
 * Fija la direccion que llevaran los correos de bienvenida. Se ejecuta una vez
 * desde el editor, tipicamente con la URL del sitio de Google.
 * @param {string} url
 * @return {!Object}
 */
/**
 * Por que existe esta distincion, que costo un error.
 *
 * Apps Script publica DOS direcciones para el mismo proyecto:
 *   .../dev   la de pruebas. Corre siempre el ultimo codigo guardado y SOLO la
 *             abre quien tenga permiso de editar el script. Un usuario normal
 *             recibe un error.
 *   .../exec  la publicada. Es la que apunta a la implementacion fija y la que
 *             se le reparte a la gente.
 *
 * Y ScriptApp.getService().getUrl() devuelve una u otra segun DONDE se ejecute:
 * desde el editor devuelve la /dev; corriendo dentro de la aplicacion publicada
 * devuelve la /exec. Como la funcion de configuracion se ejecuta justamente
 * desde el editor, averiguarla sola guardaba la direccion equivocada, y los
 * correos salian con un enlace que casi nadie podia abrir.
 *
 * De ahi las tres defensas de este archivo: no se guarda una /dev, la
 * aplicacion aprende su propia /exec cuando alguien la usa, y se puede escribir
 * a mano desde Administracion.
 *
 * @param {string=} url Opcional. Sin argumento se intenta averiguar.
 * @return {!Object}
 */
function configurarUrlAplicacion(url) {
  exigirOperador_();

  var limpia = String(url || '').trim();
  var comoSeObtuvo = 'La escribio usted';

  if (!limpia) {
    limpia = urlAprendida_();
    comoSeObtuvo = 'La aprendio la aplicacion al ser usada';
    if (!limpia) {
      try { limpia = String(ScriptApp.getService().getUrl() || '').trim(); } catch (e) { limpia = ''; }
      comoSeObtuvo = 'Se tomo del proyecto';
    }
    if (!limpia) {
      throw new Error('No se pudo averiguar la direccion. Abra la aplicacion publicada ' +
                      'una vez (la direccion que termina en /exec) y vuelva a ejecutar ' +
                      'esta funcion; o escribala desde Administracion.');
    }
  }

  validarUrlAplicacion_(limpia);

  var valores = {};
  valores[PROP_KEYS.URL_APLICACION] = limpia;
  guardarConfiguracion_(valores);

  var resultado = {
    ok: true, url: limpia, comoSeObtuvo: comoSeObtuvo,
    mensaje: 'Listo. Los correos llevaran el enlace a esta direccion.'
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Rechaza una direccion que no sirve para repartir.
 * @param {string} url
 * @private
 */
function validarUrlAplicacion_(url) {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Escriba la direccion completa, empezando por https://');
  }
  if (/\/dev\/?$/.test(url)) {
    throw new Error('Esa es la direccion de PRUEBAS (termina en /dev). Solo la puede abrir ' +
                    'quien edite el script; sus usuarios verian un error. Use la direccion ' +
                    'publicada, la que termina en /exec.');
  }
  if (!/\/exec\/?$/.test(url)) {
    throw new Error('La direccion de la aplicacion publicada termina en /exec. ' +
                    'Revise que la haya copiado completa.');
  }
}

/**
 * La direccion /exec que la aplicacion aprendio sola.
 *
 * Se guarda aparte de la que configura una persona para no pisarsela nunca: si
 * alguien escribio una a mano, esa manda.
 *
 * @return {string}
 * @private
 */
function urlAprendida_() {
  return getProp_(PROP_KEYS.URL_DETECTADA, false) || '';
}

/**
 * Deja anotada la direccion /exec la primera vez que alguien abre la aplicacion.
 *
 * Es lo que hace que en la practica no haya que configurar nada: la aplicacion
 * solo puede conocer su direccion publicada mientras la estan usando, no cuando
 * se ejecuta una funcion desde el editor.
 *
 * Nunca interrumpe la carga de la pagina: si falla, se ignora y ya.
 * @private
 */
function aprenderUrlAplicacion_() {
  try {
    if (urlAprendida_()) return;                       // ya se sabe
    var url = String(ScriptApp.getService().getUrl() || '').trim();
    if (!/^https:\/\/.+\/exec\/?$/.test(url)) return;  // no es la publicada
    var valores = {};
    valores[PROP_KEYS.URL_DETECTADA] = url;
    guardarConfiguracion_(valores);
  } catch (e) { /* aprender es una cortesia, no un requisito */ }
}

/**
 * Dice que direccion tienen hoy los enlaces de los correos, sin cambiar nada.
 *
 * Sirve para responder "hay algo que hacer?" sin tener que mandarse un correo
 * de prueba.
 *
 * @return {!Object}
 */
function verUrlAplicacion() {
  exigirOperador_();
  var guardada = getProp_(PROP_KEYS.URL_APLICACION, false) || '';
  var aprendida = urlAprendida_();
  var enUso = guardada || aprendida;

  var problema = null;
  if (!enUso) {
    problema = 'Los correos saldran sin enlace. Abra la aplicacion publicada (la ' +
               'direccion que termina en /exec) y vuelva a ejecutar esta funcion.';
  } else if (/\/dev\/?$/.test(enUso)) {
    problema = 'ATENCION: la direccion guardada es la de PRUEBAS (/dev). Solo la puede ' +
               'abrir quien edite el script, asi que los enlaces de los correos no le ' +
               'sirven a los usuarios. Corrijala desde Administracion o ejecute ' +
               'configurarUrlAplicacion despues de abrir la aplicacion publicada.';
  }

  var resultado = {
    urlQueSeUsa: enUso,
    escritaAMano: guardada || null,
    aprendidaAlUsarla: aprendida || null,
    mensaje: problema || 'Los correos ya llevan el enlace correcto. No hay nada que hacer.'
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/** @return {string} Dominio corporativo autorizado ('' = sin restriccion). */
function getDominioCorporativo_() {
  return getProp_(PROP_KEYS.DOMINIO_CORPORATIVO, false);
}

/**
 * Dominios cuyos correos pueden entrar: el de la casa mas los aliados.
 *
 * El de la casa sale de la cuenta que publica la aplicacion. Si por alguna
 * razon no se puede leer, la funcion devuelve lista vacia y quien la usa deja
 * pasar: es una cerradura secundaria —la principal es la hoja de Usuarios— y
 * dejar a toda la compania afuera por un dato que no se pudo leer seria peor
 * que el riesgo que cubre.
 *
 * @return {!Array<string>} Vacia si no se pudo determinar el dominio propio.
 */
function getDominiosPermitidos_() {
  var dueno = '';
  try {
    dueno = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (e) { /* sin permiso para saberlo */ }
  if (!dueno || dueno.indexOf('@') === -1) return [];

  var lista = [dueno.split('@')[1]];

  (CONFIG.DOMINIOS_ALIADOS || []).forEach(function (d) {
    var limpio = String(d || '').trim().toLowerCase().replace(/^@/, '');
    if (limpio && lista.indexOf(limpio) === -1) lista.push(limpio);
  });

  // La propiedad permite sumar un aliado sin publicar una version nueva.
  String(getProp_(PROP_KEYS.DOMINIOS_ALIADOS, false) || '').split(',').forEach(function (d) {
    var limpio = String(d || '').trim().toLowerCase().replace(/^@/, '');
    if (limpio && lista.indexOf(limpio) === -1) lista.push(limpio);
  });

  return lista;
}

/**
 * @param {string} correo
 * @return {boolean} true si el correo es de un dominio admitido.
 */
function dominioAdmitido_(correo) {
  var permitidos = getDominiosPermitidos_();
  if (!permitidos.length) return true;            // ver getDominiosPermitidos_
  var partes = String(correo || '').toLowerCase().split('@');
  return partes.length === 2 && permitidos.indexOf(partes[1]) !== -1;
}

/**
 * Devuelve el estado de la configuracion para el panel de Administracion.
 * @return {!Object} Diagnostico legible de que esta y que falta.
 */
function diagnosticoConfiguracion() {
  exigirOperador_();
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
