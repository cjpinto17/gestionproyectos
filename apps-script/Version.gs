/**
 * Version.gs
 * Sello de la version que esta publicada.
 *
 * El flujo de GitHub reescribe este archivo justo antes de subir el codigo, de
 * modo que la fecha del pie de pagina es la del despliegue real y no una que
 * alguien se acordo de actualizar a mano. El numero de version si se cura en el
 * repositorio: lo mueve una persona cuando el cambio lo amerita.
 *
 * Si en la aplicacion aparece "sin sellar", ese despliegue no paso por el flujo
 * automatico: alguien subio el codigo a mano desde el editor.
 */

var VERSION_APP = {
  /** Version visible. Se sube a mano cuando el cambio lo amerita. */
  numero: '1.0',

  /** Momento del despliegue, en ISO. Lo escribe el flujo de GitHub. */
  publicada: '',

  /** Commit que se publico. Lo escribe el flujo de GitHub. */
  commit: ''
};

/**
 * Datos de version para el pie de pagina.
 * @return {!Object} { numero, publicada, commit, autor }
 */
function getVersionApp_() {
  return {
    numero: VERSION_APP.numero,
    publicada: VERSION_APP.publicada,
    commit: VERSION_APP.commit,
    autor: CONFIG.APP_AUTOR
  };
}
