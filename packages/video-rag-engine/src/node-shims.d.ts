
declare module "node:crypto" { const x: any; export default x; }
declare module "node:path" { const x: any; export default x; }
declare module "node:fs" { const x: any; export default x; }
declare module "node:net" { const x: any; export default x; }
declare module "node:http" { const x: any; export default x; export type IncomingMessage = any; }
declare module "node:os" { const x: any; export default x; }
declare module "node:test" { const test: any; export default test; }
declare module "node:assert/strict" { const assert: any; export default assert; }
declare var process: any;
declare var Buffer: any;
declare function fetch(input: any, init?: any): Promise<any>;
declare var console: any;
declare var URL: any;
declare module "node:child_process" { export function spawn(command: any, args?: any, options?: any): any; }
declare module "node:fs/promises" { const x: any; export default x; export const readFile: any; export const writeFile: any; export const mkdir: any; }
declare function setTimeout(handler: any, timeout?: any, ...args: any[]): any;
declare function clearTimeout(id: any): void;
declare var FormData: any;
declare var Blob: any;
