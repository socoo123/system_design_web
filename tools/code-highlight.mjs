// Browser entry. Build the self-contained local asset with build-code-highlight.mjs.
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import lua from 'highlight.js/lib/languages/lua';
import json from 'highlight.js/lib/languages/json';

// Member access, assignment targets and operators carry much of the meaning in teaching code.
// Lookbehind is avoided so older Safari can still parse the bundle.
function lexicalModes(skipReserved, {assignments = true} = {}) {
  const modes = [
    {match: [/\./, /[A-Za-z_]\w*\b(?!\s*\()/], scope: {2: 'property'}},
    {scope: 'operator', match: /=>|->|::|==|!=|<=|>=|&&|\|\||[-+*/%]=|\+\+|[=+\-*/%<>!?&|^~]/}
  ];
  if (assignments) {
    modes.unshift({scope: 'variable', match: /\b[A-Za-z_]\w*(?=\s*=(?!=))/, 'on:begin': skipReserved});
  }
  return modes;
}

// Upstream grammars color declarations only. Teaching code reads better when call sites,
// type names and constants are colored too; reserved words keep their original scopes.
function withCallSites(grammar, {types = false, returnTypes = false, constants = false} = {}) {
  return function (hljs) {
    const language = grammar(hljs);
    const reserved = new Set();
    for (const [group, words] of Object.entries(language.keywords || {})) {
      if (group.startsWith('$')) continue;
      for (const word of Array.isArray(words) ? words : String(words).split(/\s+/)) {
        if (word.trim()) reserved.add(word.trim());
      }
    }
    function skipReserved(match, response) {
      if (reserved.has(match[0])) response.ignoreMatch();
    }
    const constantMode = {scope: 'symbol', match: /\b[A-Z][A-Z0-9_]+\b/, 'on:begin': skipReserved};
    const typeModes = types ? [
      constantMode,
      {scope: 'title.class', match: /\b[A-Z]\w*\b/, 'on:begin': skipReserved}
    ] : (constants ? [constantMode] : []);
    const callMode = {scope: 'title.function', match: /\b[A-Za-z_]\w*(?=\s*\()/, 'on:begin': skipReserved};
    const seen = new Set();
    (function addToParams(modes) {
      for (const mode of modes || []) {
        if (!mode || typeof mode !== 'object' || seen.has(mode)) continue;
        seen.add(mode);
        if (mode.className === 'params' || mode.scope === 'params') {
          mode.contains = [...(mode.contains || []), ...typeModes];
        }
        addToParams(mode.contains);
        addToParams(mode.variants);
      }
    })(language.contains);
    // Java method declarations swallow the return type, so color `Type name(` before that mode runs.
    const returnTypeModes = returnTypes ? [
      {scope: 'title.class', match: /\b[A-Z]\w*(?=(?:<[^()]*>)?(?:\[\])*\s+[A-Za-z_]\w*\s*\()/}
    ] : [];
    language.contains = [
      ...returnTypeModes, ...language.contains, callMode, ...typeModes, ...lexicalModes(skipReserved)
    ];
    return language;
  };
}

// The upstream SQL type list is ANSI-only; chapters use PostgreSQL column types.
function withPostgresTypes(grammar) {
  return function (hljs) {
    const language = grammar(hljs);
    language.keywords.type = [
      ...language.keywords.type,
      'text', 'timestamptz', 'uuid', 'bytea', 'json', 'jsonb', 'serial', 'bigserial', 'inet', 'bool'
    ];
    // SQL `=` compares, so only member access and operators are added.
    language.contains = [...language.contains, ...lexicalModes(null, {assignments: false})];
    return language;
  };
}

const grammars = {
  java: withCallSites(java, {types: true, returnTypes: true}),
  python: withCallSites(python, {types: true}),
  sql: withPostgresTypes(sql),
  lua: withCallSites(lua, {constants: true}),
  json
};
for (const [name, grammar] of Object.entries(grammars)) {
  hljs.registerLanguage(name, grammar);
}

// Chapters deliberately mix Python-shaped control flow, SQL and // / # / -- comments.
// This is lexical coloring, not a claim that teaching pseudocode is executable.
hljs.registerLanguage('pseudocode', function (hljs) {
  const keyword = [
    'if else elif then end for each in is not and or while do return yield break continue',
    'try catch except finally raise throw await async with as def class new assert',
    'begin commit rollback transaction lock unlock require reject ensure repeat until',
    'IF ELSE THEN END FOR IN NOT AND OR RETURN BEGIN COMMIT ROLLBACK',
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE INDEX',
    'PRIMARY KEY UNIQUE REFERENCES CHECK DEFAULT CONSTRAINT FOREIGN',
    'ON CONFLICT NOTHING DO EXCLUDED RETURNING JOIN LEFT RIGHT INNER OUTER',
    'ORDER BY GROUP HAVING LIMIT OFFSET ASC DESC DISTINCT AS IS NULLS',
    'CASE WHEN EXISTS BETWEEN LIKE UNION ALL FOR SHARE OF NOWAIT SKIP LOCKED'
  ].join(' ');
  const literal = 'true false null none True False None TRUE FALSE NULL NONE';
  const reserved = new Set((keyword + ' ' + literal).split(' '));
  function skipReserved(match, response) {
    if (reserved.has(match[0])) response.ignoreMatch();
  }
  return {
    name: 'Teaching pseudocode',
    keywords: {keyword, literal},
    contains: [
      hljs.COMMENT(/#|\/\/|--/, /$/),
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      // Budgets such as 5ms, 30s or 64MB read as one quantity.
      {scope: 'number', match: /\b\d+(?:[._]\d+)*(?:,\d{3}(?!\d))*(?:ms|us|µs|ns|min|s|h|d|[KMGTP]i?B|[KMB]|x)?(?!\w)/},
      {scope: 'symbol', match: /\b[A-Z][A-Z0-9_]*\b/, 'on:begin': skipReserved},
      {scope: 'title.function', match: /\b[A-Za-z_]\w*(?=\s*\()/, 'on:begin': skipReserved},
      ...lexicalModes(skipReserved)
    ]
  };
});

// The site's HTTP teaching notation also omits the protocol version on request lines.
hljs.registerLanguage('http', function (hljs) {
  return {
    name: 'HTTP',
    contains: [
      {scope: 'keyword', match: /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/},
      {scope: 'meta', match: /HTTP\/\d(?:\.\d)?/},
      {scope: 'string', match: /\/[\w/?&=.%{}:+-]+/},
      {scope: 'attribute', match: /\b[A-Za-z][A-Za-z0-9-]*(?=:\s)/},
      // Reuse JSON tokens even when teaching examples omit the blank body separator.
      ...json(hljs).contains
    ]
  };
});

export function languageFor(label, classes) {
  // Explicit teaching labels take priority over legacy language-text classes.
  if (/pseudocode/i.test(label)) return 'pseudocode';
  const named = label.match(/^(java|python|sql|lua|http|json)(?=\b|\d)/i);
  if (named) return named[1].toLowerCase();
  const marked = classes.match(/(?:^|\s)language-([\w+-]+)/);
  if (marked && hljs.getLanguage(marked[1])) return marked[1];
  // Formula / contract / conceptual-data blocks need only neutral lexical coloring.
  return 'pseudocode';
}

// Rainbow bracket pairs, skipping strings and comments. Only wraps characters, so textContent is unchanged.
const QUIET_SCOPE = /(?:^|\s)hljs-(?:string|comment|regexp|doctag)(?:\s|$)/;
export function colorBrackets(html) {
  const quiet = [];
  let depth = 0;
  return html.replace(/<span class="([^"]*)">|<\/span>|[^<]+/g, function (token, scope) {
    if (scope !== undefined) { quiet.push(QUIET_SCOPE.test(scope) || quiet[quiet.length - 1] === true); return token; }
    if (token === '</span>') { quiet.pop(); return token; }
    if (quiet[quiet.length - 1]) return token;
    return token.replace(/[()[\]{}]/g, function (bracket) {
      const opening = '([{'.indexOf(bracket) !== -1;
      if (!opening) depth = Math.max(0, depth - 1);
      const out = '<span class="hljs-bracket hljs-bracket-' + (depth % 3) + '">' + bracket + '</span>';
      if (opening) depth++;
      return out;
    });
  });
}

export function highlightCodeBlocks(root) {
  root.querySelectorAll('article.chapter pre code').forEach(function (code) {
    if (code.classList.contains('hljs')) return;
    const pre = code.parentElement;
    const label = pre.getAttribute('data-language') || code.getAttribute('data-language') || '';
    const language = languageFor(label, code.className + ' ' + pre.className);
    code.innerHTML = colorBrackets(hljs.highlight(code.textContent, {language, ignoreIllegals: true}).value);
    code.classList.add('hljs');
    code.dataset.highlightLanguage = language;
  });
}

if (typeof document !== 'undefined') highlightCodeBlocks(document);
