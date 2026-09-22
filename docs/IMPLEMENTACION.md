# Guía de implementación

Pensada para hacerse **sin conocimientos técnicos**, desde tu cuenta corporativa de Google.
Cada parte se hace una sola vez, salvo la última.

Tiempo estimado: **45 minutos** la primera vez.

> Necesitas permiso para crear archivos en la Unidad Compartida y para publicar aplicaciones
> web de Apps Script. Si tu organización lo restringe, pídeselo al administrador de Google
> Workspace antes de empezar.

---

## Parte 1 · Crear el proyecto en Google (5 min)

1. Entra a **[script.google.com](https://script.google.com)** con tu correo corporativo.
2. Clic en **Nuevo proyecto**.
3. Arriba a la izquierda, donde dice *Proyecto sin título*, clic y escribe:
   `Sistema de Gestión de Plataformas Digitales`.
4. En el menú lateral izquierdo, clic en el engranaje **Configuración del proyecto**.
5. Marca la casilla **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
6. En esa misma pantalla, busca **ID de la secuencia de comandos** y cópialo a un bloc de
   notas. Lo vas a necesitar más adelante. Se ve así: `1a2B3c...` (unos 57 caracteres).

---

## Parte 2 · Llevar el código de GitHub a Google

Tienes tres caminos. **Te recomiendo el A**: se configura una vez y después cada cambio que
yo haga en el repositorio llega solo a Google.

### Camino A · Automático (recomendado)

Una vez configurado, **no tienes que hacer nada más**: cada vez que actualicemos el código en
GitHub, se publica solo en tu proyecto de Google.

> En el paso A.2 vas a ver una página de error con la dirección `localhost:8888`. **Es parte
> del procedimiento**, no es una falla: el paso 9 explica qué hacer con ella.

**A.1 · Habilitar la API de Apps Script**

1. Entra a **[script.google.com/home/usersettings](https://script.google.com/home/usersettings)**.
2. Activa el interruptor **API de Google Apps Script**.

**A.2 · Obtener la credencial (se hace en el navegador, no instalas nada)**

1. Entra a **[shell.cloud.google.com](https://shell.cloud.google.com)** con tu correo
   corporativo. Es una terminal que Google te presta dentro del navegador.
2. Acepta el mensaje de bienvenida. Cuando veas la línea que termina en `$`, escribe esto y
   presiona Enter:

   ```
   npm install -g @google/clasp
   ```

3. Espera a que termine (1–2 minutos) y escribe **exactamente esto** (sin `--no-localhost`):

   ```
   clasp login
   ```

4. Te muestra un enlace largo y la terminal **se queda esperando**. Es normal: no la cierres
   ni presiones nada ahí.
5. Copia el enlace, ábrelo en otra pestaña del navegador y autoriza con tu cuenta corporativa.
6. **La página te va a dar error** (*No se puede acceder a este sitio*, `localhost:8888`).
   Eso es lo esperado: esa dirección vive dentro de la terminal de Google, no en tu
   computador. **No cierres esa pestaña.**
7. Copia la **dirección completa** de la barra de direcciones de esa pestaña con error.
   Empieza por `http://localhost:8888/?code=` y sigue con un texto muy largo.
8. Vuelve a la pestaña de la terminal y **abre una segunda terminal**: botón **+** en la
   barra superior de Cloud Shell.
9. En esa terminal nueva escribe `curl ` (con el espacio), pega la dirección **entre comillas
   dobles** y presiona Enter. Queda así:

   ```
   curl "http://localhost:8888/?code=4/0AX4...&scope=https://www.googleapis..."
   ```

   > Las comillas son obligatorias: sin ellas la dirección se corta y falla.
   > Hazlo dentro de los 2 minutos siguientes: el código se vence rápido. Si se venció,
   > repite desde el paso 3.

10. En la **primera** terminal debe aparecer *Authorization successful* o
    *Logged in as tu.correo@empresa.com*. Ya puedes cerrar la segunda.
11. En la primera terminal escribe:

    ```
    cat ~/.clasprc.json
    ```

12. Selecciona **todo** lo que imprime (empieza con `{` y termina con `}`) y cópialo.

> Ese texto es una llave de acceso a tu cuenta: trátalo como una contraseña. Va a quedar
> guardado cifrado en GitHub y no se puede volver a leer una vez guardado.

**A.3 · Guardar los secretos en GitHub**

1. Entra al repositorio **cjpinto17/gestionproyectos** en GitHub.
2. Clic en **Settings** (arriba) → en el menú izquierdo, **Secrets and variables** →
   **Actions**.
3. Botón **New repository secret**. Crea estos dos:

   | Name | Secret |
   | --- | --- |
   | `CLASP_CREDENTIALS` | el texto completo que copiaste en el paso A.2.6 |
   | `SCRIPT_ID` | el ID que copiaste en la Parte 1, paso 6 |

4. Listo. Desde ahora, cada cambio en la carpeta `apps-script/` se publica solo.

**A.4 · Probar que funciona**

1. En GitHub, pestaña **Actions** → en la izquierda, **Desplegar en Google Apps Script**.
2. Botón **Run workflow** → **Run workflow**.
3. Al minuto debe aparecer un chulo verde. Vuelve a tu proyecto de Apps Script, recarga la
   página y verás todos los archivos.

Si sale un error rojo, ábrelo y léeme el mensaje: casi siempre es que falta activar la API
(paso A.1) o que el secreto se pegó incompleto.

### Camino B · Un botón dentro del editor de Google

Si tu organización no permite lo anterior, existe una extensión de Chrome llamada
**Google Apps Script GitHub Assistant** (de la tienda de extensiones de Chrome). Al
instalarla aparece un menú de GitHub dentro del editor de Apps Script, donde eliges el
repositorio y la rama `claude/project-management-system-w58l3v` y presionas **Pull** para
traer el código. Cada actualización es un clic.

Es una extensión de un tercero, no de Google. Consúltalo con seguridad informática antes de
instalarla.

### Camino C · Copiar y pegar (sin configurar nada)

Sirve para salir del paso, pero hay que repetirlo con cada cambio.

En el editor de Apps Script, por cada archivo de la carpeta `apps-script/` del repositorio:
**+ Archivo** → elige **Secuencia de comandos** (para los `.gs`) o **HTML** (para los
`.html`) → nómbralo **igual, sin la extensión** → abre el archivo en GitHub, botón *Copy raw
file*, y pega.

Son 17 archivos. El manifiesto `appsscript.json` no se crea: se reemplaza su contenido.

---

## Parte 3 · Encender el sistema (10 min)

Todo esto se hace desde el editor de Apps Script, con el código ya cargado.

1. En la lista desplegable de arriba (dice *Seleccionar función*), elige **`setupInicial`** y
   presiona **Ejecutar**.
2. La primera vez Google pide permisos:
   - **Revisar permisos** → elige tu cuenta.
   - Si sale *Google no ha verificado esta aplicación*: **Configuración avanzada** → **Ir a
     Sistema de Gestión de Plataformas Digitales (no seguro)**. Es tu propio proyecto, no hay
     riesgo.
   - **Permitir**.
3. Espera el mensaje *Ejecución completada*. Acabas de crear:

   > Si la ejecución se interrumpe a la mitad, **vuelve a ejecutar `setupInicial`**: está hecha
   > para repetirse sin duplicar nada. Reutiliza lo que ya existe y crea solo lo que falta.

   - Los dos archivos de Google Sheets, con sus 17 hojas y los catálogos.
   - La plantilla del formato de requerimiento.
4. Elige la función **`cargarDatosIniciales`** y presiona **Ejecutar**. Esto carga las 8
   plataformas y las 39 iniciativas del portafolio.
5. Elige **`validarInstalacion`** y presiona **Ejecutar**. Luego abre **Registros de
   ejecución** (abajo): debe decir `problemas: []`. Si lista algo, mándamelo.
6. Para ver los archivos creados: menú **Ver → Registros**, ahí aparecen los enlaces de los
   dos Google Sheets.

---

## Parte 4 · Configurar las notificaciones y el dominio (5 min)

1. **Webhook de Google Chat**: abre el espacio de Chat donde quieres recibir los avisos →
   flecha junto al nombre del espacio → **Apps y integraciones** → **Webhooks** →
   **Agregar webhook** → nómbralo `Plataformas Digitales` → **Guardar** → copia la URL.
2. En el editor de Apps Script, abre el archivo **`Config.gs`**, y **sin modificar nada**,
   ve a la lista de funciones, elige **`guardarConfiguracion`**… *no*: esta función necesita
   datos. Hazlo así de simple:
   - Menú **+ Archivo → Secuencia de comandos**, nómbralo `Temporal`.
   - Pega esto, reemplazando los dos valores por los tuyos:

     ```javascript
     function configurar() {
       guardarConfiguracion({
         CHAT_WEBHOOK_URL: 'PEGA_AQUI_LA_URL_DEL_WEBHOOK',
         DOMINIO_CORPORATIVO: 'tuempresa.com.co'
       });
     }
     ```

   - Elige la función **`configurar`** y presiona **Ejecutar**.
   - Cuando termine, puedes borrar el archivo `Temporal`.
3. Para verificar: ejecuta **`diagnosticoConfiguracion`** y revisa los registros. Debe decir
   `chatWebhookConfigurado: true`.

---

## Parte 5 · Publicar la aplicación (5 min)

1. Botón azul **Implementar** (arriba a la derecha) → **Nueva implementación**.
2. En el engranaje junto a *Seleccionar tipo*, elige **Aplicación web**.
3. Llena así:
   - **Descripción**: `Versión 1`
   - **Ejecutar como**: **Usuario que accede a la aplicación web**
     *(esto es lo que hace que cada persona entre con su propio usuario y permisos)*
   - **Quién tiene acceso**: **Cualquier usuario de tu organización**
4. **Implementar** → copia la **URL de la aplicación web**. Esa es la dirección que le
   compartes al equipo.
5. *(Opcional, para el Camino A)* En la misma ventana verás el **ID de implementación**.
   Guárdalo como un tercer secreto en GitHub con el nombre `DEPLOYMENT_ID`: así cada cambio
   no solo sube el código, sino que actualiza la aplicación que usa el equipo.

---

## Parte 6 · Dar de alta a las personas (5 min)

Al entrar por primera vez verás el mensaje *"Su correo no está asociado a ningún usuario"*.
Es correcto: hay que registrarte.

1. Abre el Google Sheets **Parametrizacion_Plataformas_Completo** (el enlace salió en la
   Parte 3, paso 6).
2. Ve a la hoja **Usuarios** y agrega tu fila:

   | ID_Usuario | Nombre_Completo | Correo_ID | Cargo | Area | Rol_ID | Activo |
   | --- | --- | --- | --- | --- | --- | --- |
   | USR-003 | Tu nombre | tu.correo@empresa.com | Gerente | Plataformas Digitales | RO-08 | SI |

   `RO-08` es **Administrador**. Los demás roles están en la hoja `Roles`.
3. Recarga la aplicación web: ya entras y ves la pestaña **Admin**.
4. **De aquí en adelante no vuelvas a tocar el Sheets**: desde la pestaña Admin puedes crear
   usuarios, asignarles rol y administrar todos los catálogos.

> Recuerda: una persona **sin correo** también se puede registrar (por ejemplo un Business
> Owner que aún no tiene cuenta). Queda asignable en las iniciativas, pero no podrá entrar a
> la aplicación hasta que le completes el correo.

---

## Parte 7 · El día a día

| Quiero… | Dónde |
| --- | --- |
| Crear una actividad | Pestaña **Gestión** → botón **+ Nueva Actividad** |
| Mover una actividad de fase | Arrastrar la tarjeta a otra columna |
| Marcar o levantar un bloqueo | Clic en la tarjeta → botón **Marcar bloqueo** |
| Ver la carpeta o el documento | Clic en la tarjeta → botones de Drive |
| Agregar una persona | Pestaña **Admin** → Usuarios → **+ Nuevo registro** |
| Cambiar los días de SLA | Pestaña **Admin** → SLA Fases |
| Registrar un día no laborable | Pestaña **Admin** → Festivos |
| Ver los indicadores | Pestaña **Home** |

---

## Parte 8 · Cuando actualicemos el código

- **Si configuraste el Camino A**: no haces nada. El cambio se publica solo. Si además
  guardaste `DEPLOYMENT_ID`, el equipo ve la versión nueva de inmediato; si no, entra a
  **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva → Implementar**.
- **Si usas el Camino B**: abre el editor → menú GitHub → **Pull**.
- **Si usas el Camino C**: copia y pega los archivos que cambiaron.

---

## Si algo sale mal

| Mensaje | Qué significa | Qué hacer |
| --- | --- | --- |
| *Su correo no está asociado a ningún usuario* | No estás en la hoja Usuarios | Parte 6 |
| *Configuración faltante: ID_LIBRO_…* | No se ejecutó el instalador | Parte 3 |
| *No se pudo crear la carpeta en Drive* | Falta permiso en la Unidad Compartida | Pide acceso de editor a la unidad `1ib9cr7o47ecPQ3KSpcAn_mBjiY9LzqaY` |
| *Specified permissions are not sufficient…* | El proyecto cambió su lista de permisos | Vuelve a ejecutar la función: Google mostrará de nuevo la pantalla de autorización y hay que aceptarla |
| *Su rol no tiene permiso sobre la fase…* | El RBAC funcionando | Revisa el rol del usuario en Admin |
| *El sistema está ocupado atendiendo otro cambio* | Dos personas guardaron a la vez | Reintenta en unos segundos |
| *No se puede acceder a este sitio · localhost:8888* al autorizar clasp | Es el comportamiento normal de Google | Parte 2, camino A, pasos 6 a 10 |
| *invalid_grant* o *Bad Request* al hacer `curl` | El código de autorización se venció | Repite desde `clasp login` y haz el `curl` en menos de 2 minutos |
| *Faltan estos secretos del repositorio…* en GitHub Actions | No se guardaron `CLASP_CREDENTIALS` o `SCRIPT_ID` | Parte 2, camino A, paso A.3 |
| *invalid_grant* dentro de GitHub Actions | La credencial guardada caducó o se revocó | Repite el paso A.2 y actualiza el secreto `CLASP_CREDENTIALS` |
| *Error retrieving access token… reading 'access_token'* | La credencial viene de una versión de `clasp` más nueva | El flujo la convierte solo. Si aun así falla, en Cloud Shell: `npm install -g @google/clasp@2.4.2`, `clasp login` y vuelve a copiar `cat ~/.clasprc.json` |

La actividad **nunca se pierde** por un fallo de Drive, Chat o correo: se guarda igual y el
sistema te avisa qué no pudo hacer.
