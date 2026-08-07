import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'apps-script-code.gs'],
  },
];

export default eslintConfig;
