/**
 * morse-code barrel — re-exports the module's pure logic (types / generate /
 * solve / reducer / manual). The IModule binding + renderer registration live in
 * the client dir (apps/client/src/modules/morse-code/), matching every existing
 * module (wires…memory); the server registry imports the generate/reduce fns
 * directly (registry.ts direct-import convention), never via this barrel.
 */
export * from './types.js';
export * from './generate.js';
export * from './solve.js';
export * from './reducer.js';
export * from './manual.js';
