/**
 * `server-only` throws when a module importing it is pulled into a client
 * bundle, which is exactly what we want in the build and useless in a test
 * runner: vitest has no notion of a client bundle, so the real package refuses
 * to resolve and a security boundary written in a server-only module becomes
 * untestable.
 *
 * Aliased to this empty module in `vitest.config.ts`. The guarantee is a build
 * concern and the build still has the real one.
 */
export {};
