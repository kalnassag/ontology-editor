import express from 'express';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DIST = join(__dirname, '..', 'dist');

app.use(express.static(DIST));
// SPA fallback — serve index.html for all non-asset routes
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')));

app.listen(PORT, () => console.log(`Ontology Editor running at http://localhost:${PORT}`));
