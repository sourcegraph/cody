import FetchAdapter from '@pollyjs/adapter-fetch'
import type {Interceptor, Request} from '@pollyjs/core'

export class CodyNodeHttpAdapter extends FetchAdapter {
    private log(message?: any, ...optionalParams: any[]) {
        // console.log(message, optionalParams)
    }

    public async onRequest(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onRequest : ", request)

        if (request.body) {
            request.body = request.body
                .replaceAll(/`([^`]*)(cody-vscode-shim-test[^`]*)`/g, '`$2`')
                .replaceAll(/(\\\\)(\w)/g, '/$2')
        }

        return super.onRequest(request)
    }

    public async onPassthrough(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onPassthrough : ", request)
        return super.onPassthrough(request)
    }

    public async onIntercept(request: Request, interceptor: Interceptor): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onIntercept : ", request, interceptor)
        return super.onIntercept(request, interceptor)
    }

    public async onRecord(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onRecord : ", request)
        return super.onRecord(request)
    }

    public async onReplay(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onReplay : ", request)
        return super.onReplay(request)
    }

    public async onFetchResponse(pollyRequest: Request): Promise<Pick<Response,any>> {
        this.log("[CodyNodeHttpAdapter]: onFetchResponse : ", pollyRequest)
        return super.onFetchResponse(pollyRequest)
    }

    public async onRespond(request: Request, error?: Error): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onRespond : ", request, error)
        return super.onRespond(request, error)
    }

    public async onIdentifyRequest(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onIdentifyRequest : ", request)
        return super.onIdentifyRequest(request)
    }

    public async onRequestFinished(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onRequestFinished : ", request)
        return super.onRequestFinished(request)
    }

    public async onRequestFailed(request: Request): Promise<void> {
        this.log("[CodyNodeHttpAdapter]: onRequestFailed : ", request)
        return super.onRequestFailed(request)
    }
}
