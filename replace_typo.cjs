const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('雇主')) {
        const newContent = content.replace(/雇主/g, '僱主');
        fs.writeFileSync(fullPath, newContent, 'utf-8');
        console.log('Updated:', fullPath);
      }
    }
  }
}

replaceInDir('./src');
replaceInDir('./public'); // just in case
console.log('Replacement complete.');
