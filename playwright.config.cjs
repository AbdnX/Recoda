/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true
  },
  webServer: {
    command: 'npx -y serve . -l 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
};
