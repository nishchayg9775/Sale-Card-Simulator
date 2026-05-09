const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5511);
const host = process.env.QA_HOST || '127.0.0.1';

const suites = {
  feature: ['.qa-tools/qa-feature-pass.js'],
  regression: ['.qa-tools/qa-regression.js'],
  folder: ['.qa-tools/qa-folder-sync.js'],
  offer: ['.qa-tools/qa-offer-center.js'],
  transform: ['.qa-tools/qa-transform-box.js'],
  all: [
    '.qa-tools/qa-feature-pass.js',
    '.qa-tools/qa-folder-sync.js',
    '.qa-tools/qa-offer-center.js',
    '.qa-tools/qa-transform-box.js',
    '.qa-tools/qa-regression.js'
  ]
};

const suiteName = process.argv[2] || 'regression';
const selected = suites[suiteName];

if (!selected) {
  console.error(`Unknown QA suite "${suiteName}". Available: ${Object.keys(suites).join(', ')}`);
  process.exit(1);
}

function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://${host}:${port}/api/health`, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Server did not become ready on ${host}:${port}`));
        return;
      }
      setTimeout(check, 300);
    };

    check();
  });
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: root,
      stdio: 'inherit',
      env: process.env
    });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: host, PORT: String(port) }
  });

  server.stdout.on('data', chunk => process.stdout.write(chunk));
  server.stderr.on('data', chunk => process.stderr.write(chunk));

  let serverExited = false;
  server.on('exit', code => {
    serverExited = true;
    if (code !== 0 && code !== null) {
      process.stderr.write(`QA server exited with code ${code}\n`);
    }
  });

  try {
    await waitForServer();
    for (const script of selected) {
      console.log(`\nRunning ${script}`);
      await runNodeScript(script);
    }
  } finally {
    if (!serverExited) {
      server.kill();
    }
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
