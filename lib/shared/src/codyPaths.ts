// Because env-paths is distributed as an ESM module but we package everything as CommonJS,
// we have to wrap this into a dynamic import for the playwright tests
export const codyPaths = async () => {
    const envPaths = await import('env-paths')
    return envPaths.default('Cody')
}
