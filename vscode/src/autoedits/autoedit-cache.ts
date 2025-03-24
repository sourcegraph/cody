import { LRUCache } from 'lru-cache'
import { CodeToReplaceData } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

interface CachedData {
    prediction: string
    codeToReplaceData: CodeToReplaceData
}

class AutoeditCache {
    private cache = new LRUCache<string, CachedData>({ max: 20 })

    public getFromCache(document: vscode.TextDocument, position: vscode.Position): CachedData | null {
        const key = this.getCacheKey(document, position)
        return this.get(key)
    }

    public setToCache(document: vscode.TextDocument, position: vscode.Position, data: CachedData): void {
        const key = this.getCacheKey(document, position)
        this.set(key, data)
    }

    private getCacheKey(document: vscode.TextDocument, position: vscode.Position): string {
        const prefix = document.getText(new vscode.Range(0, 0, position.line, 0))
        const suffix = document.getText(new vscode.Range(position.line, position.character, document.lineCount, 0))
        return `${prefix}<CURSOR>${suffix}`
    }

    public get(key: string): CachedData | null {
        return this.cache.get(key) ?? null
    }

    public set(key: string, data: CachedData): void {
        this.cache.set(key, data)
    }

    public delete(key: string): void {
        this.cache.delete(key)
    }
}

export const autoeditCache = new AutoeditCache()

