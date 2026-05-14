const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('./src/renderer.js', 'utf8');
try {
  new vm.Script(code);
  console.log('No syntax error');
} catch(e) {
  console.log('Error:', e.message);
  const match = e.stack.match(/evalmachine.*?:(\d+)/);
  if (match) {
    const lineNum = parseInt(match[1]);
    const lines = code.split('\n');
    console.log('Around line', lineNum);
    for (let i = Math.max(0, lineNum-4); i < Math.min(lines.length, lineNum+4); i++) {
      console.log(i+1, '|', lines[i]);
    }
  }
}
