/**
 * Sesion.gs
 * Identidad de quien usa la aplicacion.
 *
 * Hasta ahora Google respondia esa pregunta: la aplicacion corria a nombre de
 * cada persona y Session.getActiveUser() decia quien era. Eso obligaba a que
 * todos tuvieran permiso sobre las hojas de calculo, y por tanto pudieran
 * abrirlas y editarlas por fuera de la aplicacion, saltandose los roles y la
 * bitacora.
 *
 * Ahora la aplicacion corre a nombre de su dueno y las hojas quedan cerradas.
 * El precio es que Google ya no identifica a quien viene de otro dominio, asi
 * que la identidad la establece este archivo, por dos caminos:
 *
 *   1. Google, cuando puede. Para la gente del mismo dominio del dueno sigue
 *      funcionando y entra sin escribir nada.
 *   2. Correo mas codigo de un solo uso. Quien escribe un correo registrado
 *      recibe un codigo EN ESE BUZON. Escribirlo prueba que el buzon es suyo;
 *      escribir el correo, por si solo, no prueba nada.
 *
 * Nada de esto reemplaza la lista de Usuarios: sigue siendo la que decide
 * quien existe y con que rol. Estos dos caminos solo establecen que el correo
 * es de quien dice ser.
 */

/** Minutos que vive un codigo de acceso. */
var CODIGO_MINUTOS = 10;
/** Intentos permitidos antes de invalidar el codigo. */
var CODIGO_INTENTOS = 3;
/** Segundos minimos entre dos solicitudes de codigo para el mismo correo. */
var CODIGO_ESPERA_SEGUNDOS = 60;
/** Horas que vive una sesion. Se renueva con el uso. */
var SESION_HORAS = 12;

/** Contexto resuelto para ESTA ejecucion. Lo fija llamar(). */
var SESION_ACTUAL = null;

/* ================================================================== */
/* Utilidades de la caja fuerte                                        */
/* ================================================================== */

/**
 * Sal del script, creada la primera vez. Sin ella, dos instalaciones con el
 * mismo codigo producirian los mismos hashes.
 * @private
 */
function salDelScript_() {
  var props = PropertiesService.getScriptProperties();
  var sal = props.getProperty('SAL_SESIONES');
  if (!sal) {
    sal = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SAL_SESIONES', sal);
  }
  return sal;
}

/**
 * Huella irreversible de un secreto. Ni los codigos ni los identificadores de
 * sesion se guardan en claro: si alguien llegara a ver las propiedades del
 * script, no podria usarlos para entrar.
 * @private
 */
function huella_(secreto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
                                      String(secreto) + salDelScript_(),
                                      Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/** @private @return {string} Codigo numerico de 6 digitos. */
function generarCodigo_() {
  // Se arma con getUuid, que es aleatorio de verdad, y no con Math.random.
  var digitos = Utilities.getUuid().replace(/\D/g, '');
  while (digitos.length < 6) digitos += Utilities.getUuid().replace(/\D/g, '');
  return digitos.slice(0, 6);
}

/** @private */
function correoNormalizado_(valor) {
  return String(valor || '').trim().toLowerCase();
}

/* ================================================================== */
/* Codigos de acceso                                                   */
/* ================================================================== */

/**
 * Envia un codigo de acceso al correo indicado, si esta registrado y activo.
 *
 * La respuesta es la misma exista o no el correo. Decir "ese correo no esta
 * registrado" le confirmaria a un desconocido que otro correo SI lo esta, y
 * eso es justamente lo que no queremos regalar.
 *
 * @param {string} correo
 * @return {!Object} { ok, mensaje }
 */
function solicitarCodigoAcceso(correo) {
  var destino = correoNormalizado_(correo);
  var respuesta = {
    ok: true,
    mensaje: 'Si ese correo esta registrado, le acaba de llegar un codigo. ' +
             'Revise su bandeja de entrada y el correo no deseado.'
  };
  if (!destino || destino.indexOf('@') === -1) {
    throw new Error('Escriba un correo valido.');
  }

  // Un usuario inactivo tampoco recibe codigo: no podria entrar de todos modos,
  // y mandarselo seria escribirle a alguien que ya salio de la operacion.
  // La respuesta sigue siendo la misma, para no revelar que existe.
  var usuario = usuarioPorCorreo_(destino);
  if (!usuario || String(usuario.Activo).toUpperCase() === 'NO') return respuesta;
  // Tampoco se manda codigo a un dominio que no admitimos: seria enviarle un
  // secreto a alguien que de todos modos no va a poder entrar.
  if (!dominioAdmitido_(destino)) return respuesta;

  var props = PropertiesService.getScriptProperties();
  var clave = 'cod_' + huella_(destino);
  var previo = leerJson_(props, clave);
  var ahora = new Date().getTime();

  // Un codigo por minuto y por correo: sin esto, cualquiera podria llenarle el
  // buzon a una persona pidiendo codigos sin parar.
  if (previo && previo.enviado && (ahora - previo.enviado) < CODIGO_ESPERA_SEGUNDOS * 1000) {
    return respuesta;
  }

  var codigo = generarCodigo_();
  props.setProperty(clave, JSON.stringify({
    huella: huella_(destino + '|' + codigo),
    expira: ahora + CODIGO_MINUTOS * 60000,
    intentos: 0,
    enviado: ahora
  }));

  MailApp.sendEmail({
    to: destino,
    subject: 'Su codigo de acceso: ' + codigo,
    htmlBody: cuerpoCodigo_(usuario, codigo)
  });

  return respuesta;
}

/**
 * Comprueba el codigo y, si es correcto, abre una sesion.
 * @param {string} correo
 * @param {string} codigo
 * @return {!Object} { ok, token, contexto }
 */
function validarCodigoAcceso(correo, codigo) {
  var destino = correoNormalizado_(correo);
  var escrito = String(codigo || '').replace(/\D/g, '');
  var props = PropertiesService.getScriptProperties();
  var clave = 'cod_' + huella_(destino);
  var guardado = leerJson_(props, clave);

  var generico = 'El codigo no es correcto o ya vencio. Pida uno nuevo.';
  if (!guardado) throw new Error(generico);
  if (new Date().getTime() > guardado.expira) {
    props.deleteProperty(clave);
    throw new Error(generico);
  }
  if (guardado.intentos >= CODIGO_INTENTOS) {
    props.deleteProperty(clave);
    throw new Error('Demasiados intentos. Pida un codigo nuevo.');
  }

  if (huella_(destino + '|' + escrito) !== guardado.huella) {
    guardado.intentos++;
    props.setProperty(clave, JSON.stringify(guardado));
    throw new Error(generico);
  }

  // Correcto: el codigo se quema, valia una sola vez.
  props.deleteProperty(clave);

  var ctx = contextoDeCorreo_(destino, 'codigo');
  if (!ctx.autorizado) throw new Error(ctx.motivo);

  return { ok: true, token: abrirSesion_(destino), contexto: ctx };
}

/** Cuerpo del correo con el codigo. @private */
function cuerpoCodigo_(usuario, codigo) {
  var nombre = String(usuario.Nombre_Completo || '').split(' ')[0] || '';
  return '<div style="font-family:Arial,sans-serif;max-width:460px;margin:0 auto;' +
    'border:1px solid #EDF1F8;border-radius:12px;overflow:hidden">' +
    '<div style="background:#00306E;color:#fff;padding:18px">' +
    '<div style="font-size:16px;font-weight:bold">' + CONFIG.APP_NOMBRE + '</div></div>' +
    '<div style="padding:22px;text-align:center">' +
    '<p style="font-size:14px;color:#0D1F3C;margin:0 0 4px;text-align:left">' +
    (nombre ? 'Hola, ' + escapeHtml_(nombre) + ':' : 'Hola:') + '</p>' +
    '<p style="font-size:13.5px;color:#0D1F3C;margin:0 0 18px;text-align:left">' +
    'Este es su c&oacute;digo para entrar:</p>' +
    '<div style="font-family:monospace;font-size:34px;font-weight:bold;letter-spacing:10px;' +
    'color:#00306E;background:#F3F6FB;border-radius:10px;padding:16px 10px">' + codigo + '</div>' +
    '<p style="font-size:12px;color:#5A6B8C;margin:16px 0 0;text-align:left">' +
    'Vence en ' + CODIGO_MINUTOS + ' minutos y sirve una sola vez. ' +
    '<b>Si usted no lo pidi&oacute;, ignore este mensaje</b> y avise al administrador: ' +
    'alguien escribi&oacute; su correo en la pantalla de ingreso.</p>' +
    '</div></div>';
}

/* ================================================================== */
/* Sesiones                                                            */
/* ================================================================== */

/**
 * Crea una sesion para un correo ya comprobado.
 * @return {string} El identificador que guarda el navegador.
 * @private
 */
function abrirSesion_(correo) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ses_' + huella_(token), JSON.stringify({
    correo: correo,
    expira: new Date().getTime() + SESION_HORAS * 3600000
  }));
  barrerVencidos_();
  return token;
}

/**
 * Correo de una sesion vigente, o '' si el identificador no sirve.
 * Cada uso renueva el plazo: quien esta trabajando no deberia ser expulsado a
 * mitad de la jornada.
 * @private
 */
function correoDeSesion_(token) {
  if (!token) return '';
  var props = PropertiesService.getScriptProperties();
  var clave = 'ses_' + huella_(token);
  var sesion = leerJson_(props, clave);
  if (!sesion) return '';

  if (new Date().getTime() > sesion.expira) {
    props.deleteProperty(clave);
    return '';
  }

  sesion.expira = new Date().getTime() + SESION_HORAS * 3600000;
  props.setProperty(clave, JSON.stringify(sesion));
  return sesion.correo;
}

/**
 * Cierra la sesion del navegador que lo pide.
 * @param {string} token
 * @return {!Object}
 */
function cerrarSesion(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty('ses_' + huella_(token));
  }
  return { ok: true };
}

/**
 * Cierra TODAS las sesiones abiertas. Para el administrador, cuando alguien
 * sale de la compania o se sospecha de un acceso indebido.
 * @return {!Object}
 */
function cerrarTodasLasSesiones() {
  exigirAdministrador_();
  var props = PropertiesService.getScriptProperties();
  var cerradas = 0;
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf('ses_') === 0) { props.deleteProperty(k); cerradas++; }
  });
  var resultado = { ok: true, cerradas: cerradas,
                    mensaje: cerradas + ' sesion(es) cerradas. Todos deberan entrar de nuevo.' };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/** Borra sesiones y codigos vencidos. @private */
function barrerVencidos_() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var ahora = new Date().getTime();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('ses_') !== 0 && k.indexOf('cod_') !== 0) return;
    try {
      var dato = JSON.parse(todas[k]);
      if (dato && dato.expira && ahora > dato.expira) props.deleteProperty(k);
    } catch (e) {
      props.deleteProperty(k);   // basura ilegible: fuera
    }
  });
}

/** @private */
function leerJson_(props, clave) {
  var texto = props.getProperty(clave);
  if (!texto) return null;
  try { return JSON.parse(texto); } catch (e) { return null; }
}
