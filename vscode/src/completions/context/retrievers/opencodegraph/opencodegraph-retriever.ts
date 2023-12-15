import { Annotation } from '@opencodegraph/client'
import * as vscode from 'vscode'

import { isDefined } from '@sourcegraph/cody-shared'

import { ContextRetriever, ContextRetrieverOptions, ContextSnippet } from '../../../types'

// TODO(sqs): import from the opencodegraph extension instead of copying here
interface OpenCodeGraphExtensionApi {
    /**
     * If this API changes, the version number will be incremented.
     */
    apiVersion(version: 1): {
        /**
         * Get OpenCodeGraph annotations for the document.
         */
        getAnnotations(doc: Pick<vscode.TextDocument, 'uri' | 'getText'>): Promise<Annotation<vscode.Range>[] | null>
    }
}

/**
 * Gets context for the current document from [OpenCodeGraph](https://opencodegraph.org) providers,
 * via the OpenCodeGraph VS Code extension (if it's installed and running).
 */
export class OpenCodeGraphRetriever implements ContextRetriever {
    public identifier = 'opencodegraph'

    private disposables: vscode.Disposable[] = []

    private ocgApi: Promise<OpenCodeGraphExtensionApi>

    constructor() {
        const ocgExtension = vscode.extensions.getExtension<OpenCodeGraphExtensionApi>('sourcegraph.opencodegraph')
        if (!ocgExtension) {
            throw new Error('OpenCodeGraph extension not installed')
        }
        this.ocgApi = Promise.resolve(ocgExtension.activate())
    }

    public async retrieve(options: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        const anns = await (await this.ocgApi).apiVersion(1).getAnnotations(options.document)
        const contextSnippets =
            anns
                ?.map(ann =>
                    ann.item.detail && !ann.item.title.includes('Hello')
                        ? {
                              fileName: `${ann.item.title}.txt`,
                              content: ann.item.detail,
                          }
                        : null
                )
                .filter(isDefined) ?? []
        return contextSnippets
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
