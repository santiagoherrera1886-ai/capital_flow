# Capital Flow · Bogotá y Medellín

Aplicación de planeación de medios de Constructora Capital. Dos espacios independientes por ciudad, imágenes oficiales y un constructor en tres pasos: proyectos, presupuesto y flow.

## Corrección de la versión 2

El histórico ahora usa las hojas **` Flow Bogota Consolidado`** y **`Flow Medellín Consolidado`** como fuentes principales. La versión anterior mostraba un subconjunto de proyectos y un intervalo de calibración de tres meses; ese subtotal no representaba la inversión de la ciudad. La selección del nuevo flow ya no modifica el histórico.

Control de todo el periodo disponible, febrero–diciembre de 2025 y febrero–octubre de 2026:

| Ciudad | Filas de detalle | Planeada, columna S (COP) | Real registrada, columna V (COP) |
| --- | ---: | ---: | ---: |
| Bogotá | 1.748 | 2.317.602.748,17 | 2.288.182.930,20 |
| Medellín | 1.507 | 998.700.182,36 | 914.783.236,42 |

Octubre tiene corte al **19 de octubre de 2026**. Enero de ambos años no figura en estas hojas: no se completa con ceros. Los valores de Excel son el snapshot recibido, no una conexión en vivo.

## Conciliación y alcance

- Se leen filas con fecha y al menos una iniciativa o campaña. Se conserva la fila 1445 de Bogotá, con presupuesto y sin nomenclatura.
- S es inversión planeada; V, inversión real registrada. No se les aplica IVA adicional ni se mezclan entre sí.
- Marca, medios no clasificados y campañas sin proyecto identificable permanecen en el total de inversión. Los filtros del histórico son explícitos y separados de los del flow.
- Los encabezados, subtotales, hojas `Copia de` y reportes RAW no se suman otra vez. Los totales se calculan desde el detalle, porque algunos subtotales almacenados tienen rangos distintos.
- Se conservan 34 grupos de filas con campaña, mes y métricas repetidas en el consolidado de Medellín. Se señalan para revisión; no se eliminan ni se certifican como duplicados sin evidencia adicional.
- Cada fila exportada conserva ciudad, mes, hoja y número de fila. Las métricas S/V/Z/AQ/AR mantienen el valor almacenado en el archivo; no se recalculan fórmulas de origen.
- Leads y CPL utilizan filas con KPI de leads coherente en X y AD. Nombres de marca, alcance, tráfico, interacciones y seguidores se excluyen del CPL, aunque su inversión siga en el total. Z se mantiene sin alterar en la vista de campañas.
- Impresiones y clics reproducen las columnas AQ/AR del consolidado. Su granularidad depende de las fórmulas de origen y pueden incluir métricas repetidas; no representan personas únicas.

## Proyecciones

El subconjunto de calibración requiere proyecto reconocido, medio compatible y KPI de leads coherente. Usa por defecto julio–septiembre de 2026, separado del intervalo visible del histórico.

- CPL = suma de inversión de leads / suma de leads.
- Opción de ponderación reciente: pesos 1, 2, … en el intervalo seleccionado y razón de sumas ponderadas. La ponderación nunca altera las cifras del histórico.
- Resultados = presupuesto / CPL; CPM = gasto / impresiones × 1.000; CTR = clics / impresiones.
- Impresiones proyectadas = presupuesto / CPM × 1.000; clics = impresiones × CTR.
- Alcance social modelado = impresiones / frecuencia supuesta, sin desduplicación. No se modela alcance de Google.
- Fallback: misma ciudad, tipología y medio, identificado como referencia. Sin CPL válido, queda presupuesto pendiente.
- Distribución por pesos con conciliación al peso. Escenarios de sensibilidad del CPL, sin presentarlos como intervalos estadísticos.
- Los flows de ciudades distintas no pueden mezclarse, aunque se importe una selección antigua.

El presupuesto empieza vacío. El usuario puede ingresar su cifra o usar la suma planeada de octubre de sus proyectos y medios seleccionados. No se presenta un presupuesto de ejemplo como si fuera histórico.

## Interfaz

Navegación superior, selector permanente Bogotá / Medellín, resumen con inversión mensual y mix por medio, histórico con vistas por mes / proyecto / campaña, y constructor en tres pasos. Las fechas, ciudad y alcance acompañan los indicadores. El histórico completo es la vista inicial.

Los 43 proyectos activos en el flow de octubre tienen imágenes verificadas en sitios oficiales. Se conservan los patrones de nomenclatura de los flows originales y se excluye el nombre de TikTok de Vento que contenía Mistral. Los borradores nuevos y flows guardados se almacenan por ciudad en el navegador, con importación/exportación JSON. Las claves locales de la versión anterior no se eliminan.

## Desarrollo y despliegue

```sh
npm test
npm run build
```

No hay dependencias de producción ni servidor. Vercel publica `dist/` con la integración de GitHub y `vercel.json`.

Recrear el snapshot (solo lectura del Excel; requiere Python y openpyxl):

```sh
python scripts/build_data.py "/ruta/CAPITAL DATA RAW_IMPORT (8).xlsx" scripts/catalog.json public/data.json
```

`build_data.py` conserva el catálogo e imágenes verificadas y extrae patrones de nomenclatura; `consolidated.py` reemplaza la calibración con los consolidados y crea el libro mayor trazable. No se exportan hojas de compradores ni información personal. No subir el Excel original al repositorio.

Las pruebas verifican la conciliación de S/V, controles mensuales, separación por ciudad, independencia del histórico, ponderación, presupuesto, escenarios y exportaciones. Se realizan comprobaciones de renderizado de las vistas sin navegador y compilación estática. El entorno de desarrollo no ofrece el navegador permitido para verificar visualmente el diseño; esa revisión no se presenta como realizada.
