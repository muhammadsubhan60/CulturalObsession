import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source, so bundle them into the API build.
export default defineConfig({ noExternal: [/^@co\//] });
