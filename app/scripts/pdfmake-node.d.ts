/**
 * pdfmake ships types for the entry the browser uses, but not for the Node
 * build under `js/`, which is the one that can read fonts off disk — so
 * `render-sample.ts` renders a sample through this instead. Only the two calls
 * it makes are described.
 */
declare module "pdfmake/js/index.js" {
  const pdfMake: {
    addFonts: (fonts: unknown) => void;
    createPdf: (doc: unknown) => { getBuffer: () => Promise<Buffer> };
  };
  export default pdfMake;
}
