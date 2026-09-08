import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { telemetry } from './telemetry.js';

const MODULE = 'Report';

export class ReportGenerator {
  constructor(db, licenseManager) {
    this.db = db;
    this.licenseManager = licenseManager;
  }

  // Generar informe en PDF
  async generarPDF(analisisResult, outputPath = null) {
  try {
    if (!this.licenseManager.esPremium()) {
      throw new Error('La generación de informes requiere licencia premium');
    }

    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;
    const margin = 50;
    const lineHeight = 20;

    // Sanitizador de texto (elimina emojis y caracteres no ASCII)
    const sanitizeText = (text) => {
      if (!text) return 'N/A';
      return text.replace(/[^ -~]/g, '').trim() || 'N/A';
    };

    const writeText = (text, size = 12, bold = false, color = rgb(0, 0, 0)) => {
      const f = bold ? fontBold : font;
      page.drawText(sanitizeText(text), {
        x: margin,
        y: y,
        size: size,
        font: f,
        color: color,
      });
      y -= lineHeight;
    };

    // Título
    writeText('DRAGON3 - INFORME FORENSE', 18, true, rgb(0.2, 0.2, 0.8));
    y -= 10;
    writeText(`Fecha: ${new Date().toLocaleString()}`, 12);
    y -= 10;

    writeText('--- DATOS DEL ANALISIS ---', 14, true);
    writeText(`ID del sello: ${analisisResult.hash || 'N/A'}`);
    writeText(`Cliente: ${analisisResult.cliente || 'N/A'}`);
    writeText(`Obra: ${analisisResult.obra || 'N/A'}`);
    writeText(`Veredicto: ${analisisResult.veredicto || 'N/A'}`);
    writeText(`Integridad legal: ${analisisResult.integridad_legal || 'N/A'}`);
    if (analisisResult.escala) writeText(`Escala detectada: ${analisisResult.escala}`);
    if (analisisResult.modo) writeText(`Modo: ${analisisResult.modo}`);

    y -= 10;
    writeText('--- METADATOS ---', 14, true);
    writeText(`Tipo de archivo: ${analisisResult.tipoArchivo || 'Desconocido'}`);
    writeText(`Dimensiones: ${analisisResult.ancho || '?'} x ${analisisResult.alto || '?'}`);
    if (analisisResult.fechaOriginal) writeText(`Fecha original: ${analisisResult.fechaOriginal}`);

    y -= 10;
    writeText('--- VEREDICTO FINAL ---', 14, true);
    const veredictoColor = analisisResult.identificado ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0);
    writeText(analisisResult.identificado ? 'AUTENTICADO' : 'NO IDENTIFICADO', 14, true, veredictoColor);

    const pdfBytes = await doc.save();
    if (outputPath) {
      fs.writeFileSync(outputPath, pdfBytes);
      telemetry.info(MODULE, `PDF generado: ${outputPath}`);
      return outputPath;
    }
    return pdfBytes;
  } catch (err) {
    telemetry.error(MODULE, `Error generando PDF: ${err.message}`);
    throw err;
  }
}

  // Generar informe CSV
  generarCSV(analisisResult, outputPath = null) {
    try {
      if (!this.licenseManager.esPremium()) {
        throw new Error('La generación de informes requiere licencia premium');
      }

      const headers = ['ID', 'Cliente', 'Obra', 'Veredicto', 'Integridad', 'Fecha'];
      const row = [
        analisisResult.hash || '',
        analisisResult.cliente || '',
        analisisResult.obra || '',
        analisisResult.veredicto || '',
        analisisResult.integridad_legal || '',
        new Date().toISOString()
      ];
      const csvContent = [headers.join(','), row.join(',')].join('\n');

      if (outputPath) {
        fs.writeFileSync(outputPath, csvContent, 'utf8');
        telemetry.info(MODULE, `CSV generado: ${outputPath}`);
        return outputPath;
      }
      return csvContent;
    } catch (err) {
      telemetry.error(MODULE, `Error generando CSV: ${err.message}`);
      throw err;
    }
  }
}