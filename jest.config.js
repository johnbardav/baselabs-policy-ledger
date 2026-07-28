module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts'
  ],
  coverageDirectory: 'coverage'
};
