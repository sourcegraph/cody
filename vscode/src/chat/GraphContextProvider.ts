import {
    type ContextGroup,
    type ContextStatusProvider,
    type Disposable,
} from '@sourcegraph/cody-shared/src/codebase-context/context-status'
import { type PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type Editor } from '@sourcegraph/cody-shared/src/editor'
import { type GraphContextFetcher } from '@sourcegraph/cody-shared/src/graph-context'

import { getGraphContextFromEditor } from '../graph/lsp/graph'

export class GraphContextProvider implements GraphContextFetcher {
    constructor(private editor: Editor) {}

    public getContext(): Promise<PreciseContext[]> {
        return getGraphContextFromEditor(this.editor)
    }

    // ContextStatusProvider
    public onDidChangeStatus(_callback: (provider: ContextStatusProvider) => void): Disposable {
        // Local graph context never changes status, so there's nothing to record.
        return {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            dispose() {},
        }
    }

    public get status(): ContextGroup[] {
        return [
            {
                name: this.editor.getWorkspaceRootUri()?.fsPath || 'Workspace',
                providers: [
                    {
                        kind: 'graph',
                        state: 'ready',
                    },
                ],
            },
        ]
    }
}
