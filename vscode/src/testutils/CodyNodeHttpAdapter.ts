import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import type { Request } from '@pollyjs/core'

export class CodyNodeHttpAdapter extends NodeHttpAdapter {
    public async onRequest(request: Request): Promise<void> {
        if (request.body) {
            try {
                request.body = request.body
                    .replaceAll(/`([^`]*)(cody-vscode-shim-test[^`]*)`/g, '`$2`')
                    .replaceAll(/(\\\\)(\w)/g, '/$2')
            } catch (e) {
                console.error('CodyNodeHttpAdapter.onRequest', e)
            }
        }

        return super.onRequest(request)
    }
}
