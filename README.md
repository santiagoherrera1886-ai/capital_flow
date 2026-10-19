# Capital Flow

Aplicación de planeación de medios para Constructora Capital. Selecciona proyectos, define presupuesto y fechas y genera un flow con proyecciones, nomenclaturas y exportaciones.

## Uso

- **Proyectos:** catálogo con imágenes oficiales, búsqueda, filtros por ciudad/tipología y selección múltiple. La selección inicial y los 30 millones COP son un borrador editable de ejemplo.
- **Mi flow:** inversión total/diaria, CPL, resultados, mix de medios y detalle de la base por fila. Permite sustituir el CPL de una campaña.
- **Históricos:** inversión y resultados observados por mes y proyecto. No aplica ponderaciones a las cifras observadas.
- **Nomenclaturas:** nombres originales o una propuesta normalizada para campañas nuevas; conserva FB, GLG, TT y VML del archivo. Actualiza trimestre, ciudad, etapa y sufijo.
- **Cómo se calcula:** fórmulas, fuentes, supuestos y limitaciones.
- **Flows guardados:** borradores en localStorage; importación/exportación JSON para mover configuraciones entre dispositivos.
- Exportación CSV UTF-8 con separador punto y coma, nombres y bases de cálculo. Impresión/PDF desde el navegador.

## Datos y alcance

Fuente: `CAPITAL DATA RAW_IMPORT (8).xlsx`, procesado el 19 de octubre de 2026. Histórico enero 2025–octubre 2026; octubre es parcial. Base predeterminada julio–septiembre 2026.

Se incluyen 81 proyectos identificados (43 presentes en el flow de octubre), 1.920 agregados de proyecto/medio/mes y 4.719 filas de los reportes seleccionados. La base publicada contiene únicamente métricas agregadas de campañas y referencias de proyectos. No contiene el Excel original, compradores, identificaciones, datos de contacto ni salarios.

### Preparación

- **Meta:** campañas OUTCOME_LEADS. Se suma todo el gasto de sus filas Leads/Mensajería para reconstruir el gasto de campaña; solo las filas Leads aportan resultados. Impresiones/clics repetidos se cuentan una vez por firma de métricas dentro de campaña y mes. El origen no contiene ID de campaña, lo cual limita la deduplicación.
- **Google:** Search y Performance Max. Conserva conversiones atribuidas decimales. Video, Display y Demand Gen quedan fuera del modelo de captación.
- **TikTok:** un reporte por ciudad/mes, priorizando el mensual. Sus filas son aditivas; no hay fecha diaria/ID en la exportación, por lo que la granularidad y los duplicados internos no pueden verificarse. No se combinan con CONSOLIDADO.
- Se excluyen awareness, marca, seguidores, campañas sin proyecto reconocido y hojas que duplican los reportes. Los descartes están contabilizados en `data.meta`.
- `Nuevo Naming` de los flows de octubre/septiembre es la fuente de plantillas. Se descarta la fila donde Vento tiene una nomenclatura de Mistral.

### Fórmulas

`CPL = Σ(w × gasto) / Σ(w × resultados)`

`CPM = 1000 × Σ(w × gasto) / Σ(w × impresiones)`

`CTR = Σ(w × clics) / Σ(w × impresiones)`

Ponderación reciente: w=1..N según mes del intervalo. Uniforme: w=1. Los proyectos con gasto y resultados válidos usan su base; sin ella, el fallback requiere la misma ciudad, tipología y plataforma. Si tampoco existe referencia, el presupuesto queda sin asignar.

`Presupuesto de proyecto = neto × peso / Σ pesos`

Pesos equitativos, proporcionales al gasto histórico o manuales. Proyectos sin gasto en reparto histórico usan la inversión media de los seleccionados con datos. El mix de medios es histórico o equitativo entre referencias disponibles. En el histórico, un canal nuevo con cero gasto propio no recibe inversión si otro sí tiene gasto; para explorar medios nuevos se usa mix equitativo.

El método de restos mayores conserva el presupuesto al peso. Días incluyen inicio y fin. Si el input incluye IVA, se divide por 1+tasa; 19% procede del archivo y es editable, no es asesoría tributaria.

`Resultados = presupuesto / CPL ajustado`

`Impresiones = presupuesto / CPM × 1000`

`Clics = impresiones × CTR`

`Alcance social modelado = impresiones / frecuencia`

Frecuencia 3,1 tomada del flow como supuesto editable. No se informa alcance total único ni se estima alcance para Google. Sensibilidad CPL ±20% editable, sin interpretarla como intervalo probabilístico. El motor es lineal: no estima saturación, causalidad, ventas ni calidad comercial. Los resultados atribuidos no están deduplicados entre plataformas.

## Desarrollo y Vercel

Sin dependencias de aplicación ni servicios de backend. HTML/CSS y módulos JavaScript.

```sh
npm test
npm run build
```

`npm run build` genera `dist/`. `vercel.json` configura el build y directorio de salida para el proyecto `capital_flow` del equipo indicado por el usuario. Conecta la rama `main` del repositorio en Vercel para el despliegue automático. Las preferencias se guardan solo en el navegador.

Para regenerar el dataset con un archivo de igual estructura, desde un entorno con `openpyxl`:

```sh
python scripts/build_data.py /ruta/al/archivo.xlsx scripts/catalog.json public/data.json
npm test
npm run build
```

El script lee solamente hojas de campañas, flows y catálogo; no procesa bases de compradores. Cambios en la estructura de hojas requieren revisión del importador.

## Verificación

Pruebas del motor para conciliación de presupuesto, IVA, fechas inclusivas, ponderación, casos sin datos, fallback, escenarios, CPL manual, nomenclaturas, exportación y exclusión de datos personales. Las imágenes enlazadas se comprobaron por respuesta HTTP y tipo de contenido. La comprobación visual en navegador no se realizó en el entorno de construcción.

Imágenes y marca: Constructora Capital y sitios oficiales de los proyectos, con enlaces de origen en cada ficha.
