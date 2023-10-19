import { PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { GraphContextFetcher } from '@sourcegraph/cody-shared/src/graph-context'

import { getGraphContextFromEditor } from '../graph/lsp/graph'

export class GraphContextProvider implements GraphContextFetcher {
    constructor(private editor: Editor) {}

    public getContext(): Promise<PreciseContext[]> {
        return getGraphContextFromEditor(this.editor)
    }
}
