// ---------- Types ----------
export interface ParsedEmail {
  index: number;                    // message index in the file
  separatorRaw: string;             // the raw "From " separator line
  envelopeFrom?: string;            // from the mbox separator (envelope sender)
  envelopeDateRaw?: string;         // ctime-style date from the separator
  envelopeDate?: Date | null;

  headersRaw: string;               // raw header block
  headers: Record<string, string>;  // unfolded + decoded headers (lowercased keys)
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  date?: Date | null;

  body: string;                     // message body as text (not MIME-parsed)
  raw: string;                      // full raw message (headers + CRLF + body)
}

const FROM_SEP = /^From ([^\s]+)\s+(.*)$/; // "From " + envelope sender + space + date

type handleEmail = (email: ParsedEmail) => Promise<void> | void;

// ---------- Public entry points ----------
export async function readMboxFile(file: File, cb: handleEmail) {
  if (!file || !cb) {
    throw new Error('Bad arguments');
  }

  // A File is a Blob, and Blob has .stream()
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let loop = true;
  let idx = 0;
  try {
    while (loop) {
      const { value, done } = await reader.read();
      if (value) buf += value;

      // Drain all complete messages currently in buf
      while (true) {
        const { email, rest } = parseFirstMboxMessage(buf);
        if (!email) break;           // need more data
        email.index = idx++;
        await cb(email);
        buf = rest;               // drop consumed part
      }

      if (done) loop = false;
    }

  } finally {
    reader.releaseLock();
  }
}


export async function looksLikeMbox(file: File, sampleBytes = 2048): Promise<boolean> {
  // Read only the first chunk (avoid loading huge files fully)
  const blob = file.slice(0, sampleBytes);
  const text = await blob.text();

  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.startsWith("From ")) return false;
  return FROM_SEP.test(firstLine);
}

// Parse at most the first *complete* message and return the remainder.
function parseFirstMboxMessage(
  text: string
): { email: ParsedEmail | null; rest: string; consumed: number } {
  // Normalize line endings to LF
  const data = text.replace(/\r\n/g, "\n");

  // Find the first real separator at a line start
  const firstSepIdx = findSepAtOrAfterSOL(data, 0);
  if (firstSepIdx < 0) {
    // No separator at all yet; keep everything for later
    return { email: null, rest: data, consumed: 0 };
  }

  // If buffer has junk before the first separator, drop it (mbox readers typically do)
  const buf = firstSepIdx === 0 ? data : data.slice(firstSepIdx);

  // Where does the first separator line end?
  const sepLineEnd = buf.indexOf("\n", 0);
  if (sepLineEnd < 0) {
    // We don't even have the full separator line yet
    return { email: null, rest: buf, consumed: 0 };
  }

  // Find the next separator line start (beginning of the *next* message)
  const nextSepIdx = findSepAtOrAfterSOL(buf, sepLineEnd + 1);

  if (nextSepIdx < 0) {
    // No next separator yet -> the first message is incomplete in the stream
    return { email: null, rest: buf, consumed: 0 };
  }

  // We have a complete message from [0 .. nextSepIdx)
  const sepLine = buf.slice(0, sepLineEnd).replace(/\n$/, "");
  const chunk = buf.slice(sepLineEnd + 1, nextSepIdx); // between separators

  // Split headers/body
  const { headersRaw, bodyRaw } = splitHeaderBody(chunk);
  const headers = parseHeaders(headersRaw);
  const body = unescapeMboxrdFromLines(bodyRaw);

  const m = sepLine.match(FROM_SEP);
  const envFrom = m?.[1] ?? "";
  const envDateRaw = m?.[2] ?? "";

  const email: ParsedEmail = {
    index: 0,
    separatorRaw: sepLine,
    envelopeFrom: envFrom || undefined,
    envelopeDateRaw: envDateRaw || undefined,
    envelopeDate: parseCtimeLikeDate(envDateRaw),

    headersRaw,
    headers,
    subject: headers["subject"],
    from: headers["from"],
    to: headers["to"],
    cc: headers["cc"],
    bcc: headers["bcc"],
    date: parseDateHeader(headers["date"]),

    body,
    raw: chunk
  };

  // Remainder starts at nextSepIdx (i.e., begins with "From ")
  const rest = buf.slice(nextSepIdx);
  const consumed = buf.length - rest.length + (firstSepIdx === 0 ? 0 : firstSepIdx);

  return { email, rest, consumed };
}

/**
 * Find a "From " separator that starts at the beginning of a line (SOL),
 * at or after `start`. Returns the absolute index, or -1 if none.
 */
function findSepAtOrAfterSOL(s: string, start: number): number {
  // Use a regex that asserts start-of-string or newline before "From "
  const re = /(^|\n)From [^\n]*/g;
  re.lastIndex = start > 0 ? start - 1 : 0; // allow matching with the (^|\n) group
  const m = re.exec(s);
  if (!m) return -1;
  // Adjust to the "F" of "From "
  const matchStart = m.index + (m[1] ? m[1].length : 0);
  // Validate the line against FROM_SEP to avoid ">From " and false positives
  const lineEnd = s.indexOf("\n", matchStart);
  const sepLine = s.slice(matchStart, lineEnd < 0 ? s.length : lineEnd);
  return FROM_SEP.test(sepLine) ? matchStart : findSepAtOrAfterSOL(s, (lineEnd < 0 ? s.length : lineEnd) + 1);
}

// ---------- Helpers: header/body split ----------
function splitHeaderBody(raw: string): { headersRaw: string; bodyRaw: string } {
  const idx = raw.indexOf("\n\n");
  if (idx === -1) {
    return { headersRaw: raw.trimEnd(), bodyRaw: "" };
  }
  return {
    headersRaw: raw.slice(0, idx).replace(/\n+$/, ""),
    bodyRaw: raw.slice(idx + 2)
  };
}

// ---------- Helpers: headers ----------
function parseHeaders(headersRaw: string): Record<string, string> {
  const lines = headersRaw.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.replace(/^\s+/, " ");
    } else {
      unfolded.push(line);
    }
  }

  const result: Record<string, string> = {};
  for (const line of unfolded) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const name = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    result[name] = decodeEncodedWords(value);
  }
  return result;
}

// ---------- Helpers: decode RFC 2047 encoded words ----------
const ENCODED_WORD = /=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g;

function decodeEncodedWords(input: string): string {
  return input.replace(ENCODED_WORD, (_m, charset, enc, text) => {
    try {
      const cs = String(charset).toLowerCase();
      const encoding = String(enc).toUpperCase();
      let bytes: Uint8Array;

      if (encoding === "B") {
        const bin = atob(text.replace(/\s+/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const qp = text
          .replace(/_/g, " ")
          .replace(/=([0-9A-Fa-f]{2})/g, (_m: any, h: string) => String.fromCharCode(parseInt(h, 16)));
        const arr = Array.from(qp, (ch: any) => ch.charCodeAt(0));
        bytes = new Uint8Array(arr);
      }

      const dec = tryTextDecoder(cs);
      return dec.decode(bytes);
    } catch {
      return input;
    }
  });
}

function tryTextDecoder(charset: string): TextDecoder {
  try {
    return new TextDecoder(charset);
  } catch {
    return new TextDecoder("utf-8");
  }
}

// ---------- Helpers: dates ----------
function parseDateHeader(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseCtimeLikeDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v + " UTC");
  return isNaN(d.getTime()) ? null : d;
}

// ---------- Helpers: mboxrd unescape ----------
function unescapeMboxrdFromLines(body: string): string {
  return body.replace(/(^|\n)>(From .*)/g, (_m, pfx, rest) => (pfx ? pfx : "") + rest);
}

// Turn LF to CRLF per RFC for .eml files
function toCRLF(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

// From your ParsedEmail, reconstruct an .eml blob.
// Prefer the *original* wire content if you have it.
// If you kept `raw = headers+body` (without the "From " line), use that:
export function buildEml(email: ParsedEmail): string {
  const raw = email.headersRaw + "\n\n" + email.body; // your `body` is already unescaped mboxrd
  return toCRLF(raw);
}
