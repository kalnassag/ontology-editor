import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compDir = path.join(__dirname, 'src', 'components');
const subdirs = ['layout', 'graph', 'forms', 'dialogs', 'core'];

subdirs.forEach(d => {
  const dirPath = path.join(compDir, d);
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  files.forEach(f => {
    if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const p = path.join(dirPath, f);
      let content = fs.readFileSync(p, 'utf-8');
      
      content = content.replace(/from\s+['"]\.\.\/\.\.\/(lib|types)([^'"]*)['"]/g, 'from "../../$1$2"');
      
      fs.writeFileSync(p, content, 'utf-8');
    }
  });
});
console.log('Fixed quotes.');
