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

// ---------- Public entry points ----------
export async function readMboxFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result ?? ""));
    // mbox is text; UTF-8 works for Gmail exports
    r.readAsText(file);
  });
}

export function looksLikeMbox(text: string): boolean {
  // Quick heuristic: file starts with a valid "From " separator line
  // and contains at least one blank line after it (headers/body start).
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.startsWith("From ")) return false;
  return FROM_SEP.test(firstLine);
}

export function parseMbox(text: string): ParsedEmail[] {
  // Normalize line endings to LF (RFC4155 uses LF)
  const data = text.replace(/\r\n/g, "\n");

  // Find all indices of real separator lines (start-of-line "From " per RFC4155)
  // NOTE: body lines that read "From " should be escaped as ">From " (mboxrd),
  // so plain "^From " is safe to treat as separators.
  const lines = data.split("\n");
  const separators: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("From ") && FROM_SEP.test(lines[i])) {
      separators.push(i);
    }
  }
  if (separators.length === 0) return [];

  const messages: ParsedEmail[] = [];
  for (let s = 0; s < separators.length; s++) {
    const start = separators[s];
    const end = s + 1 < separators.length ? separators[s + 1] - 1 : lines.length - 1;

    const sepLine = lines[start];

    // message content is after separator until just before next separator
    const chunkLines = lines.slice(start + 1, end + 1);
    const chunk = chunkLines.join("\n");

    // split headers/body at first blank line
    const headerBodySplit = splitHeaderBody(chunk);

    const headersRaw = headerBodySplit.headersRaw;
    const headers = parseHeaders(headersRaw); // unfolded + decoded, lowercased keys
    const bodyRaw = headerBodySplit.bodyRaw;

    // Unescape mboxrd ">From " lines in body: remove exactly one leading ">" when followed by "From "
    const body = unescapeMboxrdFromLines(bodyRaw);

    const [, envFrom, envDateRaw] = sepLine.match(FROM_SEP) ?? ["", "", ""];
    const envelopeDate = parseCtimeLikeDate(envDateRaw); // best-effort

    const msg: ParsedEmail = {
      index: messages.length,
      separatorRaw: sepLine,
      envelopeFrom: envFrom || undefined,
      envelopeDateRaw: envDateRaw || undefined,
      envelopeDate,

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

    messages.push(msg);
  }

  return messages;
}

// ---------- Helpers: header/body split ----------
function splitHeaderBody(raw: string): { headersRaw: string; bodyRaw: string } {
  // RFC 5322 headers end at the first empty line
  const idx = raw.indexOf("\n\n");
  if (idx === -1) {
    // no blank line -> treat all as headers; empty body
    return { headersRaw: raw.trimEnd(), bodyRaw: "" };
  }
  return {
    headersRaw: raw.slice(0, idx).replace(/\n+$/, ""),
    bodyRaw: raw.slice(idx + 2) // after the blank line
  };
}

// ---------- Helpers: headers ----------
function parseHeaders(headersRaw: string): Record<string, string> {
  // Unfold: continuation lines begin with space or tab
  const lines = headersRaw.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if (line.match(/^[ \t]/) && unfolded.length) {
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
    // Decode RFC 2047 "encoded-words" if present
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
        // Base64
        const bin = atob(text.replace(/\s+/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        // "Q" (Quoted-Printable-like for headers): "_" means space
        const qp = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: any, h: string) =>
          String.fromCharCode(parseInt(h, 16))
        );
        const arr = Array.from(qp, (ch: any) => ch.charCodeAt(0));
        bytes = new Uint8Array(arr);
      }

      // Try to decode using TextDecoder with provided charset (fallback to utf-8)
      const dec = tryTextDecoder(cs);
      return dec.decode(bytes);
    } catch {
      return input; // fallback: leave as-is
    }
  });
}

function tryTextDecoder(charset: string): TextDecoder {
  // Most Gmail exports are UTF-8; browser TextDecoder supports many common charsets.
  try { return new TextDecoder(charset); } catch { return new TextDecoder("utf-8"); }
}

// ---------- Helpers: dates ----------
function parseDateHeader(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseCtimeLikeDate(v?: string): Date | null {
  if (!v) return null;
  // mbox separator uses ctime()-like format WITHOUT TZ, intended as UTC per RFC4155.
  // Appending " UTC" makes most browsers parse it reasonably.
  // Example: "Mon Jan  2 15:04:05 2006"
  const d = new Date(v + " UTC");
  return isNaN(d.getTime()) ? null : d;
}

// ---------- Helpers: mboxrd unescape ----------
function unescapeMboxrdFromLines(body: string): string {
  // Remove exactly one leading ">" when followed by "From "
  // Do this at line starts only.
  return body.replace(/(^|\n)>(From .*)/g, (_m, pfx, rest) => (pfx ? pfx : "") + rest);
}
