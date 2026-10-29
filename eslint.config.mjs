import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'apps/web/public/**', '**/next-env.d.ts'] },
  ...tseslint.configs.recommended,
);
