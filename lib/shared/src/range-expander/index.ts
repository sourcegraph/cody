import { VsCodeFixupTaskRecipeData } from '../editor/index'

export interface RangeExpander {
    expandTheContextRange(task: VsCodeFixupTaskRecipeData): Promise<string>
}
