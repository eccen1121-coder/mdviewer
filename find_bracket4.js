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
  if ((round !== prevRound || curly !== prevCurly)) {
    const rDiff = round - prevRound;
    const cDiff = curly - prevCurly;
    // round가 닫히지 않고 계속 +1 상태인 구간 찾기
    if (round > 0 || curly > 0) {
      if (i < 200 || i > 1390) {
        console.log(`Line ${i+1}: round=${round}(${rDiff>0?'+':''}${rDiff}) curly=${curly}(${cDiff>0?'+':''}${cDiff}) | ${line.trim().substring(0, 80)}`);
      }
    }
  }
  prevRound = round;
  prevCurly = curly;
}
console.log('Final round:', round, 'curly:', curly);
