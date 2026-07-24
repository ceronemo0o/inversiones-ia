# Inversiones IA

Web educativa para aprender a invertir y hacer trading desde cero, organizada en tres secciones accesibles desde el menú superior:

- **Práctica**: los cuatro niveles de curso (principiante → experto) y un simulador general para dar tus primeros pasos.
- **Invertir**: herramienta dedicada a construir una cartera a largo plazo con precios reales del IBEX 35 (órdenes a mercado y limitadas, reparto por sector).
- **Trading**: terminal de operativa a corto plazo con gráfico en varios plazos temporales y órdenes a mercado, limitadas y stop.

Las tres usan datos reales del mercado español (IBEX 35 / BME) y dinero 100% virtual, cada una con su propio saldo independiente.

## 1. Cómo abrir la web

Esta web es **estática** (HTML + CSS + JS, sin instalación de dependencias necesaria para navegar por los cursos). La forma más sencilla y fiable de abrirla es con un pequeño servidor local, para evitar restricciones del navegador al cargar archivos JSON directamente desde el disco (`file://`):

**Opción A — con Python (si lo tienes instalado):**
```
cd "C:\Users\ceron\OneDrive\IA\inversiones ia"
python -m http.server 8000
```
Luego abre `http://localhost:8000` en el navegador.

**Opción B — con Node.js (si lo tienes instalado):**
```
cd "C:\Users\ceron\OneDrive\IA\inversiones ia"
npx serve -l 8000
```
Luego abre `http://localhost:8000`.

**Opción C — doble clic en `index.html`:**
Funciona para navegar por los cursos, pero Práctica, Invertir y Trading pueden fallar al cargar la lista de valores del IBEX 35 en algunos navegadores (Chrome bloquea `fetch()` de archivos locales por defecto). Se recomienda usar la Opción A o B.

## 2. Precios reales: no hace falta ninguna clave ni registro

Práctica, Invertir y Trading obtienen los precios de **Yahoo Finance** (una fuente de datos no oficial, pero muy usada y fiable para este tipo de proyectos), sin necesidad de crear ninguna cuenta ni pegar ninguna clave. Se probó en profundidad frente a las 35 acciones del IBEX 35 sin encontrar límites de peticiones que afecten al uso normal de la web.

Solo hace falta que el proxy local esté en marcha (ver punto 3) — la web se encarga de todo lo demás automáticamente en cuanto abres cualquiera de las tres secciones.

## 3. El proxy local (necesario: Yahoo Finance bloquea las llamadas directas)

Yahoo Finance no envía cabeceras CORS y además bloquea (HTTP 429) las peticiones que no incluyan un User-Agent de navegador, así que el proxy local incluido **no es opcional**: hace falta tenerlo arrancado para que carguen los precios. El proxy añade esa cabecera por ti.

Para no tener que acordarte de arrancarlo cada vez, está configurado para **iniciarse solo, en segundo plano, cada vez que enciendes el ordenador** (sin ninguna ventana visible), mediante un acceso en la carpeta de inicio de Windows:

```
C:\Users\ceron\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\InversionesIA-Proxy.vbs
```

Ese script lanza `proxy/start-proxy.bat`, que a su vez arranca `node proxy/proxy.js` y guarda su salida en `proxy/proxy.log` (útil para comprobar que sigue vivo o ver errores).

- **Para comprobar que está en marcha ahora mismo**: abre `http://localhost:8787/proxy` en el navegador — si ves un mensaje JSON (aunque sea de error por falta de parámetros), el proxy está activo.
- **Para desactivar el arranque automático**: borra el archivo `InversionesIA-Proxy.vbs` de la carpeta de inicio indicada arriba. El proxy seguirá pudiendo arrancarse a mano con `node proxy/proxy.js` si lo prefieres así.
- **Si cambias el PC de sitio o de usuario**, tendrás que recrear ese acceso de inicio, ya que apunta a esta ruta concreta del proyecto.

La web detectará automáticamente el fallo de la llamada directa y usará este proxy (`http://localhost:8787`) como alternativa.

## 4. Estructura del proyecto

```
inversiones ia/
├── index.html                 Portada de bienvenida (Práctica / Invertir / Trading)
├── css/styles.css             Estilos compartidos
├── js/
│   ├── progress.js            Progreso de cursos + tema claro/oscuro
│   ├── quiz.js                 Motor de cuestionarios de cada lección
│   ├── marketData.js           Capa de datos de mercado (Yahoo Finance vía proxy)
│   ├── charts.js               Gráficos de velas (TradingView Lightweight Charts)
│   └── portfolio.js            Fábrica de carteras virtuales + motor de órdenes (mercado/limitada/stop)
├── data/ibex35.json            Valores del IBEX 35 (ticker, nombre, sector)
├── cursos/
│   ├── nivel-1-principiante/   14 lecciones
│   ├── nivel-2-intermedio/     10 lecciones
│   ├── nivel-3-avanzado/       8 lecciones
│   └── nivel-4-experto/        6 lecciones
├── practica/
│   ├── index.html              Hub: acceso a los 4 niveles + simulador general
│   ├── simulador.html          Watchlist, gráfico y compra/venta simulada
│   └── historial.html          Historial de operaciones y estadísticas
├── invertir/index.html         Cartera a largo plazo: mercado/limitada + reparto por sector
├── trading/index.html          Terminal de trading: timeframes + mercado/limitada/stop
└── proxy/proxy.js              Proxy CORS local necesario (sin dependencias, arranque automático)
```

Cada sección (Práctica, Invertir, Trading) guarda su propio saldo, posiciones e historial en una clave distinta de `localStorage` (`invia_portfolio_v1`, `invia_portfolio_invertir_v1`, `invia_portfolio_trading_v1`), por lo que son totalmente independientes entre sí. Todo es local a tu equipo y a ese navegador concreto; no se envía a ningún servidor.

## 5. Órdenes limitadas y stop

Invertir y Trading permiten colocar órdenes que no se ejecutan al instante:

- **Limitada**: de compra, se ejecuta cuando el precio baja hasta tu límite o menos; de venta, cuando sube hasta tu límite o más.
- **Stop** (solo en Trading): de compra, se ejecuta cuando el precio sube hasta tu nivel de disparo o más (entrada en ruptura); de venta/stop loss, cuando baja hasta tu nivel o menos.

Mientras no se cumpla la condición, la orden queda "pendiente" (visible en su propia tabla, con opción de cancelarla) y se revisa automáticamente cada vez que llega un precio nuevo del valor correspondiente.

## 6. Ampliar a mercado europeo o mundial

El diseño está pensado para crecer: para añadir otro mercado, basta con crear un nuevo archivo como `data/eurostoxx.json` con la misma estructura que `data/ibex35.json` y usarlo en una nueva sección; el resto de la lógica (`marketData.js`, `portfolio.js`, `charts.js`) es reutilizable sin cambios.

## 7. Camino hacia una app

`proxy/proxy.js` es, además de una solución a problemas de CORS, el primer paso natural hacia un backend propio si en el futuro se quiere convertir este proyecto en una aplicación (móvil o de escritorio): la lógica de `marketData.js`, `portfolio.js` y `charts.js` está desacoplada del HTML y puede reutilizarse casi tal cual.
