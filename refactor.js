import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const map = {
  'App': 'layout',
  'OntologyList': 'layout',
  'ClassBrowserPanel': 'layout',
  'OntologyGraph': 'graph',
  'EntityGraph': 'graph',
  'ClassForm': 'forms',
  'PropertyForm': 'forms',
  'LabelEditor': 'forms',
  'ExtraTripleEditor': 'forms',
  'CreateEntityDialog': 'dialogs',
  'CreateEdgeDialog': 'dialogs',
  'ClassCard': 'core',
  'PropertyRow': 'core',
  'IndividualCard': 'core',
  'ClassDetailPane': 'core',
  'ClassHierarchyTree': 'core',
  'OntologyDiff': 'core',
  'UnassignedProperties': 'core',
  'ValidationPanel': 'core',
  'ImportExport': 'core',
};

const srcDir = path.join(__dirname, 'src');
const compDir = path.join(srcDir, 'components');

// 1. Create dirs
const dirs = new Set(Object.values(map));
dirs.forEach(d => {
  const dirPath = path.join(compDir, d);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// 2. Move files
Object.entries(map).forEach(([comp, dir]) => {
  const oldPath = path.join(compDir, `${comp}.tsx`);
  const newPath = path.join(compDir, dir, `${comp}.tsx`);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
});

// 3. Update imports in all files in src/
function updateImports(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      updateImports(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      let content = fs.readFileSync(p, 'utf-8');
      let changed = false;

      content = content.replace(/(from\s+['"])([^'"]+)(['"])/g, (match, p1, p2, p3) => {
        const basename = path.basename(p2); 
        if (map[basename] && p2.startsWith('.')) {
          const newFileAbs = path.resolve(compDir, map[basename], `${basename}.tsx`);
          const fileDirAbs = path.resolve(path.dirname(p));
          let rel = path.relative(fileDirAbs, newFileAbs);
          if (!rel.startsWith('.')) rel = './' + rel;
          rel = rel.replace(/\.tsx$/, '');
          changed = true;
          return p1 + rel + p3;
        }
        return match;
      });

      if (changed) {
        fs.writeFileSync(p, content, 'utf-8');
      }
    }
  });
}

updateImports(srcDir);
console.log('Refactoring complete.');
