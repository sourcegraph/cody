import {
    type ContextItem,
    type EditModel,
    type MentionQuery,
    type Model,
    ModelUsage,
    PromptString,
    type Rule,
    checkIfEnterpriseUser,
    currentUserProductSubscription,
    displayLineRange,
    firstResultFromOperation,
    firstValueFrom,
    modelsService,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import type { QuickPickItem } from 'vscode'
import { getEditor } from '../../editor/active-editor'
import { type TextChange, updateRangeMultipleChanges } from '../../non-stop/tracked-range'
import { ruleService } from '../../rules/service'
import { isGenerateIntent } from '../utils/edit-intent'
import type { EditInput } from './get-input'
import { CURSOR_RANGE_ITEM, EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './get-items/constants'
import { getEditInputItems } from './get-items/edit'
import { getModelInputItems, getModelOptionItems } from './get-items/model'
import { getRangeInputItems } from './get-items/range'
import { getRangeSymbolInputItems } from './get-items/range-symbols'
import type { EditModelItem, EditRangeItem } from './get-items/types'
import { type FixupMatchingContext, getMatchingContext } from './get-matching-context'
import type { GetItemsResult } from './quick-pick'
import { fetchDocumentSymbols, getLabelForContextItem, removeAfterLastAt } from './utils'

export class EditInputFlow implements vscode.Disposable {
    private document: vscode.TextDocument
    private editInput: EditInput
    private symbolsPromise: Promise<vscode.DocumentSymbol[]>
    private activeRange: vscode.Range
    private activeModel: EditModel
    private activeModelItem: EditModelItem | undefined
    private activeRangeItem: QuickPickItem
    private activeModelContextWindow: number
    private rulesToApply: Rule[] | null = null
    private showModelSelector = false
    private selectedContextItems = new Map<string, ContextItem>()
    private contextItems = new Map<string, ContextItem>()
    private textDocumentListener: vscode.Disposable | undefined
    private modelOptions: Model[] = []
    private isCodyPro = false
    private isEnterpriseUser = false
    private onRangeChangeCallback: ((newRange: vscode.Range, newTitle: string) => void) | undefined =
        undefined

    constructor(document: vscode.TextDocument, editInput: EditInput) {
        this.document = document
        this.editInput = editInput

        const editor = getEditor().active
        if (!editor) {
            throw new Error('No active editor found for EditInputLogic initialization.')
        }

        this.activeRange = editInput.expandedRange || editInput.range
        this.activeRangeItem =
            editInput.intent === 'add'
                ? CURSOR_RANGE_ITEM
                : editInput.expandedRange
                  ? EXPANDED_RANGE_ITEM
                  : SELECTION_RANGE_ITEM
        this.activeModel = editInput.model

        for (const file of editInput.userContextFiles ?? []) {
            this.selectedContextItems.set(getLabelForContextItem(file), file)
        }

        this.symbolsPromise = fetchDocumentSymbols(this.document)
        this.activeModelContextWindow = this.getContextWindowForModel(this.activeModel)

        this.textDocumentListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document !== this.document) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)
            const updatedRange = updateRangeMultipleChanges(this.activeRange, changes)
            if (!updatedRange.isEqual(this.activeRange)) {
                this.updateActiveRange(updatedRange)
            }
        })
    }

    public async init(): Promise<void> {
        const sub = await currentUserProductSubscription()
        this.isEnterpriseUser = await checkIfEnterpriseUser()
        this.isCodyPro = Boolean(sub && !sub.userCanUpgrade)

        this.modelOptions = await firstResultFromOperation(modelsService.getModels(ModelUsage.Edit))
        const modelItems = getModelOptionItems(this.modelOptions, this.isCodyPro, this.isEnterpriseUser)
        this.activeModelItem = modelItems.find(item => item.model === this.editInput.model)
        this.showModelSelector = this.modelOptions.length > 1

        this.rulesToApply =
            this.editInput.rules ??
            (await firstValueFrom(ruleService.rulesForPaths([this.document.uri])))
    }

    public getEditInputItems(input: string): GetItemsResult {
        return getEditInputItems(
            input,
            this.activeRangeItem,
            this.activeModelItem,
            this.showModelSelector,
            this.rulesToApply
        )
    }

    public getModelInputItems(): GetItemsResult {
        return getModelInputItems(
            this.modelOptions,
            this.activeModel,
            this.isCodyPro,
            this.isEnterpriseUser
        )
    }

    public getRangeSymbolInputItems(): Promise<GetItemsResult> {
        return getRangeSymbolInputItems(this.activeRange.start, this.symbolsPromise)
    }

    public getRangeInputItems(): Promise<GetItemsResult> {
        return getRangeInputItems(
            this.document,
            this.editInput,
            this.activeRange,
            this.activeModelContextWindow
        )
    }

    private getContextWindowForModel(model: EditModel): number {
        const latestContextWindow = modelsService.getContextWindowByID(model)
        return latestContextWindow.input + (latestContextWindow.context?.user ?? 0)
    }

    public getActiveRange(): vscode.Range {
        return this.activeRange
    }

    public getActiveTitle(): string {
        const relativeFilePath = vscode.workspace.asRelativePath(this.document.uri.fsPath)
        return `Edit ${relativeFilePath}:${displayLineRange(this.activeRange)} with Cody`
    }

    public setRangeListener(onRangeChangeCallback: (newRange: vscode.Range, newTitle: string) => void) {
        this.onRangeChangeCallback = onRangeChangeCallback
    }

    public updateActiveRange(range: vscode.Range, rangeItem?: EditRangeItem): void {
        this.activeRange = range
        if (rangeItem) {
            this.activeRangeItem = rangeItem
        }
        this.onRangeChangeCallback?.(this.activeRange, this.getActiveTitle())
    }

    public dispose(): void {
        this.textDocumentListener?.dispose()
        this.textDocumentListener = undefined
    }

    public async selectModel(
        item: EditModelItem
    ): Promise<{ requiresUpgrade: boolean; modelTitle?: string }> {
        if (item.codyProOnly && !this.isCodyPro && !this.isEnterpriseUser) {
            return { requiresUpgrade: true, modelTitle: item.modelTitle }
        }

        await modelsService.setSelectedModel(ModelUsage.Edit, item.model)
        this.activeModelItem = item
        this.activeModel = item.model
        this.activeModelContextWindow = this.getContextWindowForModel(item.model)
        return { requiresUpgrade: false }
    }

    public async getMatchingContextForQuery(
        mentionQuery: MentionQuery
    ): Promise<FixupMatchingContext[]> {
        const matchingContext = await getMatchingContext(mentionQuery)
        for (const { key, item } of matchingContext) {
            this.contextItems.set(key, item)
        }
        return matchingContext
    }

    public isContextOverLimit(currentInstruction: string, size?: number): boolean {
        let used = PromptString.unsafe_fromUserQuery(currentInstruction).length
        for (const [k, v] of this.selectedContextItems) {
            if (currentInstruction.includes(`@${k}`)) {
                used += v.size ?? 0
            } else {
                this.selectedContextItems.delete(k)
            }
        }
        const totalBudget = this.activeModelContextWindow
        return size ? totalBudget - used < size : false
    }

    public addSelectedContextItem(key: string, instruction: string): string {
        const contextItem = this.contextItems.get(key)
        if (contextItem) {
            this.selectedContextItems.set(key, contextItem)
            return `${removeAfterLastAt(instruction)}@${key} `
        }
        return instruction
    }

    public finalizeInput(instructionValue: string): EditInput {
        const instruction = PromptString.unsafe_fromUserQuery(instructionValue.trim())
        const finalUserContextFiles = Array.from(this.selectedContextItems)
            .filter(([key]) => instruction.toString().includes(`@${key}`))
            .map(([, value]) => value)

        const isGenerate = isGenerateIntent(this.document, this.activeRange)

        return {
            instruction: instruction.trim(),
            userContextFiles: finalUserContextFiles,
            model: this.activeModel,
            range: this.activeRange,
            intent: isGenerate ? 'add' : 'edit',
            mode: isGenerate ? 'insert' : 'edit',
            rules: this.rulesToApply,
        }
    }
}
