import express from 'express';
import multer from 'multer';
import cors from 'cors';

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';

function extractNumbers(text) {
  const matches = text.match(/\b\d+(?:[\.,]\d+)?\b/g) ?? [];
  return matches
    .map((s) => parseFloat(s.replace(',', '.')))
    .filter((n) => Number.isFinite(n));
}

function findTarifa(text, tarifasCfe) {
  const lower = text.toLowerCase();
  for (const t of tarifasCfe) {
    if (lower.includes(t.toLowerCase())) return t;
  }
  const m = lower.match(/tarifa\s*[:=]?\s*([a-z0-9\-\(\)\s\.]+)/i);
  if (!m) return null;
  return (m[1] || '').trim();
}

function findMes(text, meses) {
  const lower = text.toLowerCase();
  for (const m of meses) {
    if (lower.includes(m.toLowerCase())) return m;
  }
  return null;
}

async function ocrTextFromBuffer(buf) {
  const API_KEY = process.env.VISION_API_KEY;
  if (!API_KEY) throw new Error('VISION_API_KEY no configurada');

  const base64 = buf.toString('base64');
  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
    }],
  };

  const res = await fetch(`${VISION_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  const text = json.responses?.[0]?.fullTextAnnotation?.text ?? '';
  if (json.responses?.[0]?.error) throw new Error(`Vision API: ${json.responses[0].error.message}`);
  return text;
}

app.post(
  '/ocr',
  upload.fields([
    { name: 'headerImage', maxCount: 1 },
    { name: 'consumptionImage', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const header = req.files?.headerImage?.[0];
      const consumption = req.files?.consumptionImage?.[0];

      if (!header || !consumption) {
        return res.status(400).json({ error: 'Faltan imágenes: headerImage y/o consumptionImage' });
      }

      const tarifasCfe = [
        '1', '1A', '1B', '1C', '1D', '1E', '1F',
        'DAC (Doméstica de Alto Consumo)',
      ];
      const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];

      const [headerText, consumptionText] = await Promise.all([
        ocrTextFromBuffer(header.buffer),
        ocrTextFromBuffer(consumption.buffer),
      ]);

      const tarifa = findTarifa(headerText, tarifasCfe);
      const mesRecibo = findMes(headerText, meses);

      const nums = extractNumbers(consumptionText);
      const kwhMatches = (consumptionText.match(/\b\d+(?:[\.,]\d+)?\b\s*k\s*wh\b/gi) ?? [])
        .map((s) => {
          const n = s.match(/\b\d+(?:[\.,]\d+)?\b/);
          if (!n) return null;
          return parseFloat(n[0].replace(',', '.'));
        })
        .filter((n) => Number.isFinite(n));

      const consumos = (kwhMatches.length >= 12 ? kwhMatches : nums).slice(0, 12);

      return res.status(200).json({
        tarifa: tarifa ?? null,
        mesRecibo: mesRecibo ?? null,
        consumosMensualesKwh: consumos,
        ...(!tarifa || !mesRecibo || consumos.length < 12
          ? { error: 'No se pudieron inferir todos los campos con alta confianza' }
          : {}),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error interno OCR', details: String(e) });
    }
  }
);

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OCR API listening on http://0.0.0.0:${PORT}`);
});
