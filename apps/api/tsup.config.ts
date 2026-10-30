import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source, so they are bundled in. Everything listed in this
// package's dependencies (incl. Prisma and its pg driver) stays external and loads from node_modules.
export default defineConfig({ noExternal: [/^@co\//] });
