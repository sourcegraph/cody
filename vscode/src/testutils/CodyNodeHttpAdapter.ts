import type { Request } from '@pollyjs/core'
import HttpAdapter from './pollyjs/NodeHttpAdapter'

export class CodyNodeHttpAdapter extends HttpAdapter {
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
