function escapeHtml(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

interface Token {
  start: number;
  end: number;
  text: string;
  cls: string;
}

const rules: Array<{ re: RegExp; cls: string }> = [
  { re: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, cls: 'tok-cmt' },
  { re: /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, cls: 'tok-str' },
  { re: /@[a-zA-Z_$][\w$]*/g, cls: 'tok-dec' },
  {
    re: /\b(string|number|boolean|void|null|undefined|never|any|unknown|object|symbol|bigint|Array|Promise|Map|Set|Date|Error|Record|Partial|Required|Readonly|Pick|Omit|RegExp)\b/g,
    cls: 'tok-type',
  },
  {
    re: /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\b/g,
    cls: 'tok-kw',
  },
  { re: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|0b[01]+)\b/g, cls: 'tok-num' },
  { re: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, cls: 'tok-fn' },
];

const priority: Record<string, number> = { 'tok-cmt': 0, 'tok-str': 1 };

export function highlight(code: string): string {
  const tokens: Token[] = [];

  rules.forEach(({ re, cls }) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, text: m[0], cls });
    }
  });

  tokens.sort((a, b) =>
    a.start !== b.start ? a.start - b.start : (priority[a.cls] ?? 9) - (priority[b.cls] ?? 9)
  );

  const filtered: Token[] = [];
  let lastEnd = 0;
  tokens.forEach((tok) => {
    if (tok.start >= lastEnd) {
      filtered.push(tok);
      lastEnd = tok.end;
    }
  });

  let result = '';
  let pos = 0;
  filtered.forEach((tok) => {
    if (tok.start > pos) result += escapeHtml(code.slice(pos, tok.start));
    result += '<span class="' + tok.cls + '">' + escapeHtml(tok.text) + '</span>';
    pos = tok.end;
  });
  if (pos < code.length) result += escapeHtml(code.slice(pos));
  return result;
}

export function splitHtmlByLine(html: string): string[] {
  const rawLines = html.split('\n');
  const result: string[] = [];
  let openStack: string[] = [];

  for (const rawLine of rawLines) {
    const prefix = openStack.join('');

    const tagRe = /<(\/?)span([^>]*)>/g;
    let m;
    while ((m = tagRe.exec(rawLine)) !== null) {
      if (m[1] === '/') {
        openStack.pop();
      } else {
        openStack.push(`<span${m[2]}>`);
      }
    }

    const closeTags = '</span>'.repeat(openStack.length);
    result.push(prefix + rawLine + closeTags);
  }

  return result;
}
