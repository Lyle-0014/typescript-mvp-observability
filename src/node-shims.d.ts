declare const process: { env: Record<string, string | undefined>; exitCode?: number };
declare module "node:test" { const test: any; export default test; }
declare module "node:assert/strict" { const assert: any; export default assert; }
