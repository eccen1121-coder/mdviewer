const fs = require('fs');
const code = fs.readFileSync('./src/renderer.js', 'utf8');
const lines = code.split('\n');
let round = 0, curly = 0;
let inStr = false, strChar = '';
let inLineComment = false;
// 각 라인의 누적 괄호 상태 기록
const states = [];

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
  states.push({ line: i+1, round, curly });
}

// 마지막 100줄에서 round/curly가 변하는 지점 출력
console.log('Last 50 lines bracket state:');
for (let i = Math.max(0, states.length - 50); i < states.length; i++) {
  const s = states[i];
  if (s.round !== 0 || s.curly !== 0) {
    console.log(`Line ${s.line}: round=${s.round} curly=${s.curly} | ${lines[i].trim().substring(0, 80)}`);
  }
}
console.log('Final round:', round, 'curly:', curly);
