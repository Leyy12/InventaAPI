// Jest runs ONLY the files in tests/jest. The other tests in this repo use
// Node's built-in runner (node --test) and are started with their npm scripts.
export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/jest/**/*.test.js'],
  transform: {},
  collectCoverageFrom: [
    'services/product-contract.js',
    'services/api-key-security.js',
    'services/rate-limit-client-ip.js',
    'services/payment-contract.js',
    'functions/entitlement-limits.mjs',
    'functions/request-limit-policy.mjs',
    'scripts/stats/statistics.mjs',
  ],
  coverageDirectory: 'test-results/coverage',
};
