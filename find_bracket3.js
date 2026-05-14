const fs = require('fs');
const code = fs.readFileSync('./src/renderer.js', 'utf8');
const lines = code.split('\n');
let round = 0, curly = 0;
let inStr = false, strChar = '';
let inLineComment = false;
let prevRound = 0, prevCurly = 0;

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
  // 이전 줄과 비교하여 괄호가 처음으로 불균형해지는 지점 찾기
  if ((round !== prevRound || curly !== prevCurly) && i > 1400) {
    console.log(`Line ${i+1}: round=${round}(${round-prevRound>0?'+':''}${round-prevRound}) curly=${curly}(${curly-prevCurly>0?'+':''}${curly-prevCurly}) | ${line.trim().substring(0, 80)}`);
  }
  prevRound = round;
  prevCurly = curly;
}
