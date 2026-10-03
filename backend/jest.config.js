// Unit tests: every *.spec.ts under src
module.exports = {
  rootDir: '.',
  // Generated Prisma files import './x.js'; map those back to the .ts sources.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [151002] } }],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
