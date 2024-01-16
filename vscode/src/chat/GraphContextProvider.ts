import {
    type ContextGroup,
    type ContextStatusProvider,
    type Disposable,
    type Editor,
    type GraphContextFetcher,
    type PreciseContext,
} from '@sourcegraph/cody-shared'

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
