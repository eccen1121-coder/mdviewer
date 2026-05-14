const fs = require('fs');
const code = fs.readFileSync('./src/renderer.js', 'utf8');
const lines = code.split('\n');
let round = 0, curly = 0;
let inStr = false, strChar = '';
let inLineComment = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  inLineComment = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = line[j+1];
    if (inLineComment) break;
    if (inStr) {
      if (ch === strChar && line[j-1] !== '\\') inStr = false;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; break; }
    if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
    if (ch === '`') { inStr = true; strChar = '`'; continue; }
    if (ch === '(') round++;
    if (ch === ')') round--;
    if (ch === '{') curly++;
    if (ch === '}') curly--;
  }
  if (round > 12 || curly > 12) {
    console.log('HIGH at line', i+1, '| round:', round, 'curly:', curly, '|', line.trim().substring(0, 80));
  }
}
console.log('Final round:', round, 'curly:', curly);
