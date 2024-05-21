import type { URI } from 'vscode-uri'

import type { RangeData } from '../common/range'
import type {
    ActiveTextEditor,
    ActiveTextEditorDiagnostic,
    ActiveTextEditorSelection,
    ActiveTextEditorVisibleContent,
    Editor,
} from '../editor'

export class MockEditor implements Editor {
    constructor(private mocks: Partial<Editor> = {}) {}

    public getWorkspaceRootUri(): URI | null {
        return this.mocks.getWorkspaceRootUri?.() ?? null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        return this.mocks.getActiveTextEditorSelection?.() ?? null
    }

    public getActiveTextEditorDiagnosticsForRange(
        range: RangeData
    ): ActiveTextEditorDiagnostic[] | null {
        return this.mocks.getActiveTextEditorDiagnosticsForRange?.(range) ?? null
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        return this.mocks.getActiveTextEditor?.() ?? null
    }

    public getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null {
        return this.mocks.getActiveTextEditorVisibleContent?.() ?? null
    }

    public showWarningMessage(message: string): Promise<void> {
        return this.mocks.showWarningMessage?.(message) ?? Promise.resolve()
    }

    public async getTextEditorContentForFile(uri: URI, range?: RangeData): Promise<string> {
        return this.mocks.getTextEditorContentForFile?.(uri, range) ?? Promise.resolve('')
    }
}

export const defaultEditor = new MockEditor()
