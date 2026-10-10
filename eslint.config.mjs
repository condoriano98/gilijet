import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Flat config — Next.js 16 removed `next lint`, so this is the lint entry
// point now (package.json "lint": "eslint ."). Mirrors the old `.eslintrc.json`
// (`extends: next/core-web-vitals`), with two deliberate relaxations:
//
//   * Next 16's core-web-vitals turns on eslint-plugin-react-hooks v7, the
//     React Compiler ruleset (purity / static-components / set-state-in-effect).
//     The project has not adopted it and the upgrade shouldn't force unrelated
//     refactors, so those three are off — same posture as the Next 15 lint.
//   * react/no-unescaped-entities was not enforced before; apostrophes in
//     copy (e.g. blog posts) are intentional.
export default defineConfig([
  ...nextVitals,
  {
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'off',
      // Code style rules: single quotes, semicolons
      'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'semi': ['error', 'always'],
      // Detect unused variables (complements typecheck)
      'no-unused-vars': 'off', // disabled in favor of TypeScript
    },
  },
  // Layering: app -> features -> shared. Imports may only point 'down'.
  // Features may import each other (booking/payments/tickets are one
  // interlocking flow), but neither features nor shared may reach into app/.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/features/*', '@/app/*', '@/mcp/*', '**/features/**', '**/app/**', '**/mcp/**'], message: 'shared/ is the lowest layer: it must not import features/, app/ or mcp/.' },
        ],
      }],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/mcp/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/app/*', '**/app/**'], message: 'features/ must not import from app/ (routes depend on features, not the other way round).' },
        ],
      }],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'node_modules/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);