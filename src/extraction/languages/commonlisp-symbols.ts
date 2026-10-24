export interface CommonLispSymbol {
  packageName: string;
  name: string;
  external: boolean;
}

export function commonLispPackageName(name: string): string {
  if (name === 'CL') return 'COMMON-LISP';
  return name === 'COMMON-LISP-USER' ? 'CL-USER' : name;
}

export function readCommonLispName(raw: string): string | null {
  let result = '';
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char === '\\') {
      if (++i >= raw.length) return null;
      result += raw[i];
    } else if (char === '|') {
      escaped = !escaped;
    } else {
      if (!escaped && /[\s():"';`,]/.test(char)) return null;
      result += escaped ? char : char.toUpperCase();
    }
  }
  return escaped || !result ? null : result;
}

export function printCommonLispName(name: string): string {
  return /^[A-Z0-9!$%&*+\-./<=>?@^_~]+$/.test(name)
    ? name : `|${name.replace(/[\\|]/g, '\\$&')}|`;
}

export function parseCommonLispSymbol(raw: string, packageName: string): CommonLispSymbol | null {
  let escaped = false;
  let separator = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === '|') escaped = !escaped;
    if (!escaped && raw[i] === ':') { separator = i; break; }
  }
  if (separator === 0) return null;
  const prefix = separator < 0 ? null : readCommonLispName(raw.slice(0, separator));
  const internal = separator >= 0 && raw[separator + 1] === ':';
  const name = readCommonLispName(separator < 0 ? raw : raw.slice(separator + (internal ? 2 : 1)));
  if (!name || (separator >= 0 && !prefix)) return null;
  return { packageName: commonLispPackageName(prefix ?? packageName), name, external: separator >= 0 && !internal };
}

export function commonLispKey(symbol: CommonLispSymbol): string {
  return `${printCommonLispName(symbol.packageName)}::${printCommonLispName(symbol.name)}`;
}

export function commonLispReference(symbol: CommonLispSymbol): string {
  return `${printCommonLispName(symbol.packageName)}${symbol.external ? ':' : '::'}${printCommonLispName(symbol.name)}`;
}

export function commonLispDesignator(raw: string): string | null {
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1).replace(/\\(.)/g, '$1');
  return readCommonLispName(raw.replace(/^'|^#?:/, ''));
}

export function commonLispExport(name: string): string {
  return `commonlisp:export:${encodeURIComponent(name)}`;
}
