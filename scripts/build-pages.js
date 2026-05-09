const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const publicFiles = [
  ['styles.css', 'styles.css'],
  ['app-config.js', 'app-config.js'],
  ['app.js', 'app.js'],
  ['Layer 1.png', 'Layer 1.png'],
  ['Light.zip', 'Light.zip'],
  ['Dark.zip', 'Dark.zip'],
  ['sale data 22 April.xlsx', 'sale data 22 April.xlsx']
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function buildIndex() {
  const source = fs.readFileSync(path.join(root, 'Mr. Card Arora.html'), 'utf8');
  return source
    .replace('<title>Univest Card Studio</title>', '<title>Univest Card Studio</title>\n    <base href="./" />')
    .replace(
      '<script src="app-config.js"></script>\n    <script src="app.js"></script>',
      '<script>window.UCS_STATIC_MODE = true;</script>\n    <script src="app-config.js"></script>\n    <script src="app.js"></script>'
    );
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), buildIndex(), 'utf8');
fs.writeFileSync(path.join(dist, '.nojekyll'), '', 'utf8');

for (const [srcName, destName] of publicFiles) {
  copyFile(path.join(root, srcName), path.join(dist, destName));
}

console.log(`GitHub Pages build created at ${dist}`);
