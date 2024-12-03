import FetchAdapter from '@pollyjs/adapter-fetch'
import type { Request } from '@pollyjs/core'

export class CodyNodeFetchAdapter extends FetchAdapter {
    public async onRequest(request: Request): Promise<void> {
        if (request.body) {
            request.body = request.body
                .replaceAll(/`([^`]*)(cody-vscode-shim-test[^`]*)`/g, '`$2`')
                .replaceAll(/(\\\\)(\w)/g, '/$2')
        }

        return super.onRequest(request)
    }

    public async onRequestFailed(request: Request): Promise<void> {
        return super.onRequestFailed(request)
    }
}
