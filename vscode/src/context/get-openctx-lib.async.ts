
export async function getOpenCtxController() {
    return (await import('@openctx/vscode-lib')).createController
}
