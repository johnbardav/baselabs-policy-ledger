import fs from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  'README.md',
  'docs/INSTALL.md',
  'docs/RUN.md',
  'docs/ARCHITECTURE.md',
  'docs/ASSESSMENT_CHECKLIST.md',
  'docs/COMMIT_PLAN.md',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  'migrations/001_core_schema.sql',
  'migrations/002_ledger_guards.sql',
  'migrations/003_append_only_guards.sql',
  'src/policies/policies.controller.ts',
  'src/policies/policies.service.ts',
  'test/unit/proration.spec.ts',
  'test/integration/policy-flow.e2e-spec.ts',
];

const forbiddenTerms = ['typeorm', 'sequelize', 'prisma', 'mikro-orm'];
let failed = false;

for (const relativePath of requiredFiles) {
  try {
    await fs.access(path.resolve(relativePath));
  } catch {
    console.error(`Missing required file: ${relativePath}`);
    failed = true;
  }
}

const searchableExtensions = new Set(['.ts', '.js', '.mjs', '.json', '.md', '.sql']);
async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (searchableExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const file of await walk(path.resolve('.'))) {
  const contents = (await fs.readFile(file, 'utf8')).toLowerCase();
  for (const term of forbiddenTerms) {
    if (contents.includes(term) && !file.endsWith('verify-project.mjs')) {
      console.error(`Forbidden ORM reference "${term}" found in ${path.relative('.', file)}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('Project structure verified: required files exist and no ORM references were found.');
