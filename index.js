import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Tesseract from 'tesseract.js';

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

async function ocrTextFromBuffer(buf) {
  const { data } = await Tesseract.recognize(buf, 'spa', {
    logger: (info) => {
      if (info.status === 'recognizing text') return;
      console.log(info);
    },
  });
  return data.text;
}

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
          ? { error: 'No se pudieron inferir todos los campos' }
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
