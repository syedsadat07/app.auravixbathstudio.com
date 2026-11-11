const createJiti = require('jiti');
const jiti = createJiti(__filename, {
  interopDefault: true,
  esmResolve: true,
  alias: {
    '@': require('path').resolve(__dirname, '../src')
  }
});
jiti('./render-pdf-test.mjs');

