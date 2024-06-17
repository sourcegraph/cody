import { createController } from '@openctx/vscode-lib';

export function getOpenCtxController() {
    return Promise.resolve(createController)
}
