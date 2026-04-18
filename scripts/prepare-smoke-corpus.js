'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'ci', 'smoke-corpus.json');
const outDirArg = process.argv[2];

if (!outDirArg) {
  process.stderr.write('Usage: node scripts/prepare-smoke-corpus.js <output-dir>\n');
  process.exit(1);
}

const outDir = path.resolve(outDirArg);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const cases = manifest.cases || [];

function copyFile(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing smoke corpus source file: ${from}`);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(outDir, { recursive: true, force: true });

for (const entry of cases) {
  const schemaSource = path.join(rootDir, 'corpus', entry.schemaId, 'schema.graphqls');
  const schemaTarget = path.join(outDir, entry.schemaId, 'schema.graphqls');
  copyFile(schemaSource, schemaTarget);

  const querySource = path.join(rootDir, 'corpus', entry.schemaId, entry.queryId, 'query.graphql');
  const queryTarget = path.join(outDir, entry.schemaId, entry.queryId, 'query.graphql');
  copyFile(querySource, queryTarget);

  if (entry.variablesId) {
    const variablesSource = path.join(
      rootDir,
      'corpus',
      entry.schemaId,
      entry.queryId,
      entry.variablesId,
      'variables.json',
    );
    const variablesTarget = path.join(
      outDir,
      entry.schemaId,
      entry.queryId,
      entry.variablesId,
      'variables.json',
    );
    copyFile(variablesSource, variablesTarget);
  }
}

process.stdout.write(`Prepared ${cases.length} smoke test case(s) in ${outDir}\n`);
