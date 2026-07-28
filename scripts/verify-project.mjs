import fs from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  'README.md',

  'docs/INSTALL.md',
  'docs/RUN.md',
  'docs/ARCHITECTURE.md',
  'docs/DEPLOYMENT.md',

  'package.json',
  'package-lock.json',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',

  'nest-cli.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.frontend.json',
  'tsconfig.spec.json',
  'jest.config.js',
  'test/jest-e2e.json',

  'migrations/001_core_schema.sql',
  'migrations/002_ledger_guards.sql',
  'migrations/003_append_only_guards.sql',
  'migrations/004_policy_currency_guards.sql',

  'src/main.ts',
  'src/app.module.ts',
  'src/policies/policies.controller.ts',
  'src/policies/policies.service.ts',
  'src/policies/policies.repository.ts',

  'test/unit/proration.spec.ts',
  'test/unit/history.spec.ts',
  'test/unit/canonical-json.spec.ts',
  'test/integration/policy-flow.e2e-spec.ts',
];

const forbiddenDependencies = [
  'typeorm',
  'sequelize',
  'prisma',
  '@prisma/client',
  'mikro-orm',
  '@mikro-orm/core',
];

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-test',
  'coverage',
]);

const searchableExtensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.json',
  '.sql',
]);

let failed = false;

function reportFailure(message) {
  console.error(message);
  failed = true;
}

async function fileExists(relativePath) {
  try {
    await fs.access(path.resolve(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath) {
  return fs.readFile(path.resolve(relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function walk(directory) {
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (searchableExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

for (const relativePath of requiredFiles) {
  if (!(await fileExists(relativePath))) {
    reportFailure(`Missing required file: ${relativePath}`);
  }
}

try {
  const packageJson = await readJson('package.json');

  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  for (const dependency of forbiddenDependencies) {
    if (dependency in dependencies) {
      reportFailure(
        `Forbidden ORM dependency found in package.json: ${dependency}`,
      );
    }
  }

  if (packageJson.engines?.node !== '>=20') {
    reportFailure('package.json must declare Node.js >=20.');
  }

  if (packageJson.devDependencies?.typescript !== '5.8.3') {
    reportFailure('TypeScript must be pinned to version 5.8.3.');
  }

  if (
    !String(packageJson.devDependencies?.jest ?? '').startsWith('^29.')
  ) {
    reportFailure('Jest major version must be 29.');
  }

  if (
    !String(packageJson.devDependencies?.['ts-jest'] ?? '').startsWith(
      '^29.',
    )
  ) {
    reportFailure('ts-jest major version must be 29.');
  }

  if (
    !String(packageJson.devDependencies?.['@types/jest'] ?? '').startsWith(
      '^29.',
    )
  ) {
    reportFailure('@types/jest major version must be 29.');
  }

  const requiredScripts = [
    'build:frontend',
    'build:api',
    'build',
    'start:dev',
    'start:prod',
    'db:migrate',
    'db:seed',
    'db:setup',
    'demo',
    'test',
    'test:integration',
    'test:all',
    'verify',
  ];

  for (const scriptName of requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) {
      reportFailure(`Missing package.json script: ${scriptName}`);
    }
  }

  const lockfile = await readJson('package-lock.json');

  if (lockfile.lockfileVersion !== 3) {
    reportFailure('package-lock.json must use lockfileVersion 3.');
  }

  if (lockfile.packages?.['']?.devDependencies?.typescript !== '5.8.3') {
    reportFailure(
      'package-lock.json must record TypeScript version 5.8.3.',
    );
  }

  const tsconfig = await readJson('tsconfig.json');
  const compilerOptions = tsconfig.compilerOptions ?? {};

  if (compilerOptions.rootDir !== './src') {
    reportFailure('tsconfig.json rootDir must be "./src".');
  }

  if (compilerOptions.outDir !== './dist') {
    reportFailure('tsconfig.json outDir must be "./dist".');
  }

  if (compilerOptions.target !== 'ES2022') {
    reportFailure('tsconfig.json target must be ES2022.');
  }

  if (compilerOptions.module !== 'commonjs') {
    reportFailure('tsconfig.json module must be commonjs.');
  }

  if ('baseUrl' in compilerOptions) {
    reportFailure('tsconfig.json must not define baseUrl.');
  }

  if ('ignoreDeprecations' in compilerOptions) {
    reportFailure(
      'tsconfig.json must not define ignoreDeprecations.',
    );
  }

  const buildConfig = await readJson('tsconfig.build.json');

  if (buildConfig.extends !== './tsconfig.json') {
    reportFailure(
      'tsconfig.build.json must extend tsconfig.json.',
    );
  }

  const frontendConfig = await readJson('tsconfig.frontend.json');

  if (frontendConfig.compilerOptions?.outFile !== 'public/app.js') {
    reportFailure(
      'tsconfig.frontend.json must emit public/app.js.',
    );
  }

  const specConfig = await readJson('tsconfig.spec.json');
  const specOptions = specConfig.compilerOptions ?? {};

  if (specConfig.extends !== './tsconfig.json') {
    reportFailure(
      'tsconfig.spec.json must extend tsconfig.json.',
    );
  }

  if (specOptions.rootDir !== '.') {
    reportFailure(
      'tsconfig.spec.json rootDir must be ".".',
    );
  }

  if (specOptions.outDir !== './dist-test') {
    reportFailure(
      'tsconfig.spec.json outDir must be "./dist-test".',
    );
  }

  if (specOptions.declaration !== false) {
    reportFailure(
      'tsconfig.spec.json declaration must be false.',
    );
  }

  if (specOptions.incremental !== false) {
    reportFailure(
      'tsconfig.spec.json incremental must be false.',
    );
  }

  const specTypes = specOptions.types ?? [];

  if (!specTypes.includes('node') || !specTypes.includes('jest')) {
    reportFailure(
      'tsconfig.spec.json must include node and jest types.',
    );
  }

  const specIncludes = specConfig.include ?? [];

  if (
    !specIncludes.includes('src/**/*.ts') ||
    !specIncludes.includes('test/**/*.ts')
  ) {
    reportFailure(
      'tsconfig.spec.json must include src/**/*.ts and test/**/*.ts.',
    );
  }

  const jestConfig = await readText('jest.config.js');

  if (!jestConfig.includes('<rootDir>/tsconfig.spec.json')) {
    reportFailure(
      'jest.config.js must use <rootDir>/tsconfig.spec.json.',
    );
  }

  const e2eConfig = await readJson('test/jest-e2e.json');

  const e2eTransform = Object.values(
    e2eConfig.transform ?? {},
  )[0];

  if (
    !Array.isArray(e2eTransform) ||
    e2eTransform[0] !== 'ts-jest' ||
    e2eTransform[1]?.tsconfig !==
      '<rootDir>/tsconfig.spec.json'
  ) {
    reportFailure(
      'test/jest-e2e.json must use <rootDir>/tsconfig.spec.json.',
    );
  }

  const gitignore = await readText('.gitignore');

  for (const ignoredPath of [
    'node_modules/',
    'dist/',
    'dist-test/',
    'coverage/',
    '.env',
  ]) {
    if (!gitignore.includes(ignoredPath)) {
      reportFailure(`.gitignore must contain: ${ignoredPath}`);
    }
  }

  if (!gitignore.includes('!.env.example')) {
    reportFailure('.gitignore must allow .env.example.');
  }
} catch (error) {
  reportFailure(
    `Configuration verification failed: ${
      error instanceof Error
        ? error.message
        : String(error)
    }`,
  );
}

for (const file of await walk(path.resolve('.'))) {
  if (file.endsWith(path.join('scripts', 'verify-project.mjs'))) {
    continue;
  }

  const contents = (
    await fs.readFile(file, 'utf8')
  ).toLowerCase();

  for (const dependency of forbiddenDependencies) {
    if (contents.includes(dependency)) {
      reportFailure(
        `Forbidden ORM reference "${dependency}" found in ${path.relative(
          '.',
          file,
        )}`,
      );
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  'Project structure verified: required files exist, dependency versions are aligned, TypeScript and Jest configurations are consistent, and no ORM dependencies or imports were found.',
);
