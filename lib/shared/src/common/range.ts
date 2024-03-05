/**
 * A range of text in a document. Unlike {@link vscode.Range}, this just contains the data. Do not
 * use {@link vscode.Range} when serializing to JSON because it serializes to an array `[start,
 * end]`, which is impossible to deserialize correctly without knowing that the value is for a
 * {@link vscode.Range}.
 */
export interface RangeData {
    start: { line: number; character: number }
    end: { line: number; character: number }
}

/**
 * Return the plain {@link RangeData} for a rich instance of the class {@link vscode.Range}.
 */
export function toRangeData<R extends RangeData>(range: R): RangeData
export function toRangeData<R extends RangeData>(range: R | undefined): RangeData | undefined
export function toRangeData<R extends RangeData>(range: R | undefined): RangeData | undefined {
    return range
        ? {
              start: { line: range.start.line, character: range.start.character },
              end: { line: range.end.line, character: range.end.character },
          }
        : undefined
}
