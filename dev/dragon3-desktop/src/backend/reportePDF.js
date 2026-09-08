import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { telemetry } from './telemetry.js';

const MODULE = 'ReportePDF';

export async function generarInformeProyecto(proyectoId, rutaSalida, db) {
  try {
    const proyecto = await db.buscarPorId(proyectoId);
    if (!proyecto) throw new Error('Proyecto no encontrado');

    const config = await db.obtenerConfiguracion();
    const sellos = await db.obtenerSellosPorProyecto(proyectoId);
    telemetry.info(MODULE, `Generando informe para proyecto ${proyectoId}: ${sellos.length} sellos`);

    // Márgenes más profesionales (30pt)
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const writeStream = fs.createWriteStream(rutaSalida);
    doc.pipe(writeStream);

    const MARGIN = 30;
    const PAGE_WIDTH = doc.page.width - (MARGIN * 2);

    // ============================================================
    // PIE DE PÁGINA AUTOMÁTICO (Gestionado por eventos)
    // ============================================================
    doc.on('pageAdded', () => {
      const currentY = doc.y;
      doc.fontSize(8).font('Helvetica').fillColor('#7f8c8d');
      doc.text(
        'Generado por Dragon3 - Marca de Agua Forense y Sello MBH',
        MARGIN,
        doc.page.height - 40,
        { align: 'left', width: PAGE_WIDTH }
      );
      doc.y = currentY; // Restaura la posición original
    });

    // ============================================================
    // BLOQUE 1: CABECERA Y METADATOS DE AUTOR
    // ============================================================
    let hasLogo = false;
    if (config.logo_path && fs.existsSync(config.logo_path)) {
      try {
        doc.image(config.logo_path, MARGIN, MARGIN, { width: 60 });
        hasLogo = true;
      } catch (e) {}
    }

    // Posicionamiento de la info del autor (al lado del logo o arriba)
    const infoX = hasLogo ? MARGIN + 75 : MARGIN;
    doc.y = MARGIN;

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b');
    doc.text(config.nombre_autor || 'Estudio Fotográfico', infoX, doc.y);
    
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    if (config.direccion_autor) doc.text(config.direccion_autor, infoX, doc.y + 2);
    if (config.web_autor) doc.text(`Web: ${config.web_autor}`, infoX, doc.y + 2);
    if (config.email_usuario) doc.text(`Email: ${config.email_usuario}`, infoX, doc.y + 2);
    if (config.telefono_autor) doc.text(`Teléfono: ${config.telefono_autor}`, infoX, doc.y + 2);
    if (config.redes_sociales) doc.text(`Redes: ${config.redes_sociales}`, infoX, doc.y + 2);

    // Línea divisoria elegante bajo la cabecera
    doc.y = Math.max(doc.y + 15, MARGIN + 65);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + PAGE_WIDTH, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc.moveDown(1.5);

    // ============================================================
    // BLOQUE 2: TÍTULO DEL DOCUMENTO
    // ============================================================
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('Certificado de Autenticidad y Protección Forense', MARGIN, doc.y);
    
    doc.fontSize(9).font('Helvetica').fillColor('#64748b');
    doc.text(`Generado el: ${new Date().toLocaleString('es-ES')}`, MARGIN, doc.y + 3);
    doc.moveDown(1.5);

    // ============================================================
    // BLOQUE 3: DATOS DEL PROYECTO (Layout Limpio)
    // ============================================================
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b');
    doc.text('Datos del Proyecto', MARGIN, doc.y);
    doc.moveDown(0.4);

    const printMetaRow = (label, value) => {
      if (!value) return;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text(`${label}: `, MARGIN, doc.y, { continued: true });
      doc.font('Helvetica').fillColor('#1e293b').text(value);
      doc.y += 2;
    };

    printMetaRow('Nombre del proyecto', proyecto.proyecto_nombre || 'Sin nombre');
    printMetaRow('Descripción', proyecto.descripcion || 'Sin descripción');
    printMetaRow('Total de imágenes selladas', `${sellos.length}`);
    if (proyecto.coleccion) printMetaRow('Colección', proyecto.coleccion);
    if (proyecto.derechos) printMetaRow('Derechos', proyecto.derechos);
    
    doc.moveDown(1.5);

    // ============================================================
    // BLOQUE 4: TABLA DE IMÁGENES RESTRUCTURADA
    // ============================================================
    if (sellos.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b');
      doc.text('Listado de Imágenes Selladas', MARGIN, doc.y);
      doc.moveDown(0.5);

      // Reajuste exacto de columnas para aprovechar el ancho A4 (535pt libres)
      const colWidths = [25, 75, 85, 85, 90, 90, 85];
      const headers = ['#', 'ID', 'Cliente', 'Obra', 'Colección', 'Derechos', 'Fecha'];

      const printHeader = (y) => {
        doc.rect(MARGIN, y - 4, PAGE_WIDTH, 18).fill('#f8fafc'); // Fondo sutil para cabecera
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
        let currentX = MARGIN;
        headers.forEach((h, i) => {
          doc.text(h, currentX + 4, y, { width: colWidths[i] - 4, align: 'left' });
          currentX += colWidths[i];
        });
        return y + 18;
      };

      let startY = printHeader(doc.y);
      let rowCount = 0;

      for (const sello of sellos) {
        rowCount++;
        
        // Control preventivo de salto de página
        if (startY > doc.page.height - 70) {
          doc.addPage();
          startY = printHeader(MARGIN + 10);
        }

        // Alternancia de color de fondo en filas (Zebra striping)
        if (rowCount % 2 === 0) {
          doc.rect(MARGIN, startY - 3, PAGE_WIDTH, 15).fill('#f1f5f9');
        }

        doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
        const fecha = sello.fecha_creacion ? new Date(sello.fecha_creacion).toLocaleDateString('es-ES') : 'N/A';
        const rowData = [
          `${rowCount}`,
          sello.hash_suffix || 'N/A',
          sello.cliente || 'N/A',
          sello.obra || 'N/A',
          (sello.coleccion || 'N/A').substring(0, 14),
          (sello.derechos || 'N/A').substring(0, 14),
          fecha
        ];

        let xRow = MARGIN;
        rowData.forEach((text, i) => {
          doc.text(text, xRow + 4, startY, { width: colWidths[i] - 4, align: 'left', lineBreak: false });
          xRow += colWidths[i];
        });

        startY += 15;
      }

      doc.y = startY;
      doc.moveDown(1.5);
    }

    // ============================================================
    // BLOQUE 5: TEXTO LEGAL / CERTIFICADO
    // ============================================================
    if (doc.y > doc.page.height - 200) doc.addPage(); // Evitar orfandad del bloque legal

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b');
    doc.text('Declaración de Cobertura Tecnológica', MARGIN, doc.y);
    doc.moveDown(0.5);

    const textoCertificado = `Por medio del presente, se certifica que las ${sellos.length} imágenes del proyecto "${proyecto.proyecto_nombre || 'Sin nombre'}" han sido protegidas con el estándar criptográfico Dragon3, el cual inyecta metadatos forenses avanzados en los dominios espaciales de los archivos originales (PNG) asegurando el sello MBH (Made By Humans).\n\nEste sistema garantiza de manera matemática la integridad del autor frente a distribuciones o explotaciones no autorizadas en entornos analógicos o digitales.`;

    doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(textoCertificado, MARGIN, doc.y, {
      align: 'justify',
      width: PAGE_WIDTH,
      lineGap: 3
    });
    doc.moveDown(2);

    // ============================================================
    // BLOQUE 6: FIRMA Y CIERRE
    // ============================================================
    if (doc.y > doc.page.height - 120) doc.addPage();

    // Línea de firma minimalista
    const firmaY = doc.y + 40;
    doc.moveTo(MARGIN, firmaY).lineTo(MARGIN + 150, firmaY).strokeColor('#b2bec3').lineWidth(0.5).stroke();
    
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text('Firma del autor / titular', MARGIN, firmaY + 5);
    if (config.nombre_autor) {
      doc.fontSize(8).font('Helvetica').fillColor('#475569').text(config.nombre_autor, MARGIN, doc.y + 2);
    }

    // Renderizado del pie de página manual sólo para la primera página si fuera necesario
    doc.fontSize(8).font('Helvetica').fillColor('#7f8c8d');
    doc.text(
      'Generado por Dragon3 - Marca de Agua Forense y Sello MBH',
      MARGIN,
      doc.page.height - 40,
      { align: 'left', width: PAGE_WIDTH }
    );

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    telemetry.info(MODULE, `Informe PDF generado con éxito en: ${rutaSalida}`, {
      proyectoId,
      total: sellos.length
    });

    return { ok: true, ruta: rutaSalida };
  } catch (err) {
    telemetry.error(MODULE, `Error generando PDF: ${err.message}`, { stack: err.stack });
    throw new Error(`Error generando PDF: ${err.message}`);
  }
}