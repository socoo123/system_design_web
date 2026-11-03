// Browser entry. Build the self-contained local asset with build-code-highlight.mjs.
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import lua from 'highlight.js/lib/languages/lua';
import json from 'highlight.js/lib/languages/json';

for (const [name, grammar] of Object.entries({java, python, sql, lua, json})) {
  hljs.registerLanguage(name, grammar);
}

// Chapters deliberately mix Python-shaped control flow, SQL and // / # / -- comments.
// This is lexical coloring, not a claim that teaching pseudocode is executable.
hljs.registerLanguage('pseudocode', function (hljs) {
  const keyword = [
    'if else elif then end for each in not and or while do return yield break continue',
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
      hljs.C_NUMBER_MODE,
      {scope: 'symbol', match: /\b[A-Z][A-Z0-9_]*\b/, 'on:begin': skipReserved},
      {scope: 'title.function', match: /\b[A-Za-z_]\w*(?=\s*\()/, 'on:begin': skipReserved}
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

export function highlightCodeBlocks(root) {
  root.querySelectorAll('article.chapter pre code').forEach(function (code) {
    if (code.classList.contains('hljs')) return;
    const pre = code.parentElement;
    const label = pre.getAttribute('data-language') || code.getAttribute('data-language') || '';
    const language = languageFor(label, code.className + ' ' + pre.className);
    code.innerHTML = hljs.highlight(code.textContent, {language, ignoreIllegals: true}).value;
    code.classList.add('hljs');
    code.dataset.highlightLanguage = language;
  });
}

if (typeof document !== 'undefined') highlightCodeBlocks(document);
