import * as vscode from 'vscode'

import { VsCodeFixupTaskRecipeData } from '../editor/index'

export interface RangeExpander {
    expandTheContextRange(task: VsCodeFixupTaskRecipeData): Promise<vscode.Range | null>
}
