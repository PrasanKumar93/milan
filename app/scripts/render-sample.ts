import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeQuote } from "../src/core/engine";
import { buildWorkbook } from "../src/export/excel";
import { buildDoc } from "../src/export/pdf";
import { fileNameFor } from "../src/export/layout";
import { sample, toQuote } from "../src/test/corpus";

/**
 * Render one of the sample quotations through the app's own exporters, so the
 * output can be put side by side with the original PDF and opened in Excel.
 *
 *   npm run sample:pdf 7178 out/
 *
 * The tests check the numbers and the formulas; this is for looking at the page.
 */

const [proformaNo = "7178", outDir = "."] = process.argv.slice(2);

mkdirSync(outDir, { recursive: true });

const quote = toQuote(sample(proformaNo));

// The browser fetches the mark and the stamp; here they are read off disk and
// handed over the same way, as data URLs.
const png = (name: string) =>
  `data:image/png;base64,${readFileSync(resolve(`public/${name}.png`)).toString("base64")}`;
const pictures = { logo: png("logo"), stamp: png("stamp") };
const doc = buildDoc(computeQuote(quote), pictures);

// The node build reads fonts off disk rather than out of a virtual file system.
const fonts = resolve("node_modules/pdfmake/fonts/Roboto");
const pdfMake = (await import("pdfmake/js/index.js")).default;
pdfMake.addFonts({
  Roboto: {
    normal: `${fonts}/Roboto-Regular.ttf`,
    bold: `${fonts}/Roboto-Medium.ttf`,
    italics: `${fonts}/Roboto-Italic.ttf`,
    bolditalics: `${fonts}/Roboto-MediumItalic.ttf`,
  },
});

const pdfPath = resolve(outDir, fileNameFor(quote));
writeFileSync(pdfPath, await pdfMake.createPdf(doc).getBuffer());
console.log(pdfPath);

const ExcelJS = (await import("exceljs")).default;
const workbook = new ExcelJS.Workbook();
buildWorkbook(computeQuote(quote), workbook, pictures);

const xlsxPath = resolve(outDir, fileNameFor(quote, "xlsx"));
await workbook.xlsx.writeFile(xlsxPath);
console.log(xlsxPath);
