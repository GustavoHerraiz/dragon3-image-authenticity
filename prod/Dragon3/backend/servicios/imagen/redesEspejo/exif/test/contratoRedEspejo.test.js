import assert from "assert";
import { analizar } from "../modelo.js";

describe("Contrato red espejo EXIF", function () {
  this.timeout(2000);

  it("Debe cumplir contrato y lógica para idImagen=1", async () => {
    const input = {
      idImagen: "1",
      datos: {
        make: "Canon", model: "EOS 5D", makernote: true,
        datetimeoriginal: "2025-07-21T10:00:00Z",
        software: "Canon Camera",
        thumbnail: true,
        gps: { lat: 40, lon: -3 },
        modifydate: "2025-07-21T10:05:00Z",
        orientation: 1,
        formato: "JPEG"
      }
    };
    const out = await analizar(input);
    assert.strictEqual(out.idImagen, input.idImagen);
    assert.ok(typeof out.score === "number");
    assert.ok(["humana", "ai", "indeterminado"].includes(out.clase));
    assert.ok(Array.isArray(out.features) && out.features.length === 9);
    out.features.forEach(f => assert.ok(f === 0 || f === 1));
    assert.deepStrictEqual(out.exif, input.datos);
    assert.ok(typeof out.timestamp === "string");
  });

  it("Debe manejar EXIF corrupto (no objeto, null, array, string)", async () => {
    const casosCorruptos = [
      { idImagen: "corrupt1", datos: null },
      { idImagen: "corrupt2" }, // sin datos
      { idImagen: "corrupt3", datos: [] },
      { idImagen: "corrupt4", datos: "no es objeto" }
    ];
    for (const input of casosCorruptos) {
      const out = await analizar(input);
      assert.strictEqual(out.idImagen, input.idImagen);
      assert.ok(Array.isArray(out.features), "features debe ser array");
      assert.strictEqual(out.features.length, 9);
      out.features.forEach((f, i) => assert.ok(f === 0, `feature[${i}] debe ser 0 con EXIF corrupto`));
      assert.strictEqual(out.clase, "indeterminado");
      assert.ok(out.warning && typeof out.warning === "string", "Debe emitir warning");
    }
  });

  it("Detecta AI con firma camuflada en software (mayúsculas, espacios, unicode)", async () => {
    const casosAI = [
      { idImagen: "ai1", datos: { software: "Stable Diffusion", formato: "JPEG" } },
      { idImagen: "ai2", datos: { software: "stable   diffusion", formato: "JPEG" } },
      { idImagen: "ai3", datos: { software: "    STABLE DIFFUSION   ", formato: "JPEG" } },
      { idImagen: "ai4", datos: { software: "StaBle dıffuѕion", formato: "JPEG" } }, // unicode "ı", "ѕ"
      { idImagen: "ai5", datos: { software: "Midjourney", formato: "JPEG" } },
      { idImagen: "ai6", datos: { software: "Dall·E", formato: "JPEG" } },
      { idImagen: "ai7", datos: { software: "Adobe Photoshop Beta (AI)", formato: "JPEG" } }
    ];
    for (const input of casosAI) {
      const out = await analizar(input);
      assert.strictEqual(out.idImagen, input.idImagen);
      assert.strictEqual(out.clase, "ai", `Debe detectar AI en ${input.datos.software}`);
      assert.ok(out.features[4] === 1, "Feature software AI debe ser 1");
    }
  });

  it("Detecta fechas EXIF implausibles (futuras, muy antiguas, mal formateadas)", async () => {
    const casosFechas = [
      { idImagen: "fecha1", datos: { datetimeoriginal: "2077-01-01T00:00:00Z", formato: "JPEG" } }, // futuro lejano
      { idImagen: "fecha2", datos: { datetimeoriginal: "1899-12-31T23:59:59Z", formato: "JPEG" } }, // antes de la fotografía
      { idImagen: "fecha3", datos: { datetimeoriginal: "not-a-date", formato: "JPEG" } },
      { idImagen: "fecha4", datos: { datetimeoriginal: "2025-02-30T10:00:00Z", formato: "JPEG" } }, // fecha imposible
      { idImagen: "fecha5", datos: { datetimeoriginal: "", formato: "JPEG" } }
    ];
    for (const input of casosFechas) {
      const out = await analizar(input);
      assert.strictEqual(out.idImagen, input.idImagen);
      assert.ok(out.warning && typeof out.warning === "string", "Debe advertir sobre fecha implausible");
    }
  });

  it("Detecta EXIF con GPS inverosímil o mal formado", async () => {
    const casosGPS = [
      { idImagen: "gps1", datos: { gps: { lat: 999, lon: -999 }, formato: "JPEG" } }, // fuera de rango
      { idImagen: "gps2", datos: { gps: { lat: null, lon: null }, formato: "JPEG" } },
      { idImagen: "gps3", datos: { gps: "no es objeto", formato: "JPEG" } }
    ];
    for (const input of casosGPS) {
      const out = await analizar(input);
      assert.strictEqual(out.idImagen, input.idImagen);
      assert.ok(Array.isArray(out.features));
      assert.strictEqual(out.features[6], 0, "El feature GPS debe ser 0 si el GPS no es válido");
    }
  });

  it("Maneja EXIF con campos extraños, basura o muy grandes (no rompe contrato)", async () => {
    const basura = {};
    for (let i = 0; i < 1_000; i++) basura["campo" + i] = "a".repeat(1000);
    const input = { idImagen: "basura1", datos: basura };
    const out = await analizar(input);
    assert.strictEqual(out.idImagen, input.idImagen);
    assert.ok(Array.isArray(out.features));
    assert.strictEqual(out.features.length, 9);
    assert.ok(["humana", "indeterminado", "ai"].includes(out.clase));
    assert.deepStrictEqual(out.exif, basura);
  });
});