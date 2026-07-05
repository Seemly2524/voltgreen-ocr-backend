# VoltGreen OCR Backend

API OCR usando Google Cloud Vision (vía API Key).

## Requisitos

- Node.js 18+
- API Key de Google Cloud Vision con Vision API habilitada

## Instalar

```bash
cd backend
npm install
```

## Ejecutar local

```bash
set VISION_API_KEY=AIzaSyB_lX6XcTdg_LELIczqIutMg6UL7JgoohI
npm start
```

El servidor escucha en `http://localhost:8080`.

## Endpoint

`POST /ocr` — multipart/form-data con campos:
- `headerImage` — foto del encabezado del recibo
- `consumptionImage` — foto de la tabla de consumos

## Despliegue

La API Key se configura vía variable de entorno `VISION_API_KEY`.
"# voltgreen-ocr-backend" 
