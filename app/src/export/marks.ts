/**
 * The two pictures on the document: the letterhead mark and the rubber stamp
 * over the signature. They are files in `public/` rather than strings in the
 * source, so replacing one is dropping in a new PNG — but pdfmake wants the
 * bytes inline, so the browser fetches each once and keeps the data URL for the
 * rest of the session. A quote still prints, without them, if they cannot be
 * read.
 */

export const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;
export const STAMP_URL = `${import.meta.env.BASE_URL}stamp.png`;

export interface Marks {
  logo?: string;
  stamp?: string;
}

const cache = new Map<string, string | null>();

export async function marks(): Promise<Marks> {
  const [logo, stamp] = await Promise.all([dataUrl(LOGO_URL), dataUrl(STAMP_URL)]);
  return { logo, stamp };
}

async function dataUrl(url: string): Promise<string | undefined> {
  const held = cache.get(url);
  if (held !== undefined) return held ?? undefined;

  try {
    const blob = await (await fetch(url)).blob();
    const read = await new Promise<string>((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(blob);
    });
    cache.set(url, read);
    return read;
  } catch {
    cache.set(url, null);
    return undefined;
  }
}
