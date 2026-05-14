/**
 * highlight.js 경량 번들 생성 스크립트
 * esbuild를 사용하여 필요한 언어만 포함한 브라우저 번들 생성
 */

const fs = require('fs');
const path = require('path');

// 진입점 파일 생성 (필요한 언어만 import)
const entryContent = `
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import dart from 'highlight.js/lib/languages/dart';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';
import ini from 'highlight.js/lib/languages/ini';
import diff from 'highlight.js/lib/languages/diff';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('java', java);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('plaintext', plaintext);

window.hljs = hljs;
`;

const entryPath = path.join(__dirname, '_hljs_entry.mjs');
fs.writeFileSync(entryPath, entryContent);

const { execSync } = require('child_process');
const outputPath = path.join(__dirname, 'src/vendor/highlight.min.js');

console.log('Building lightweight highlight.js bundle...');
try {
  const cmd = `./node_modules/.bin/esbuild "${entryPath}" --bundle --minify --format=iife --outfile="${outputPath}"`;
  execSync(cmd, { stdio: 'inherit', shell: true });
  const originalSize = fs.statSync(path.join(__dirname, 'src/vendor/highlight.min.js')).size;
  console.log(`✓ Bundle created: ${(originalSize / 1024).toFixed(1)} KB`);
} finally {
  fs.unlinkSync(entryPath);
}
