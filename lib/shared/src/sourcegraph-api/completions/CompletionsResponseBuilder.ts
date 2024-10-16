/**
 * Helper to build the `completion` text from streaming LLM completions.
 *
 * - When api-version<=1, the `.completion` property always includes the full response
 * - When api-version>=2, the `.deltaText` property includes the incremental addition to the response
 */
export class CompletionsResponseBuilder {
    public totalCompletion = ''
    constructor(public readonly apiVersion: number) {}
    public nextCompletion(completion: string | undefined, deltaText: string | undefined): string {
        if (this.apiVersion >= 2) {
            this.totalCompletion += deltaText ?? ''
            return this.totalCompletion
        }
        this.totalCompletion = completion ?? ''
        return this.totalCompletion
    }

    public static fromUrl(url: string): CompletionsResponseBuilder {
        const apiVersion = Number.parseInt(new URL(url).searchParams.get('api-version') ?? '0', 10)
        return new CompletionsResponseBuilder(apiVersion)
    }
}
