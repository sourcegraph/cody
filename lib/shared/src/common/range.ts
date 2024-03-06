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
export function toRangeData(
    badVSCodeSerializedRange: [{ line: number; character: number }, { line: number; character: number }]
): RangeData
export function toRangeData<R extends RangeData>(
    range: R | [{ line: number; character: number }, { line: number; character: number }] | undefined
): RangeData | undefined {
    // HACK: Handle if the `vscode.Range` value was accidentally JSON-serialized as [start, end],
    // which `vscode.Range` instances do when JSON-serialized because of their `toJSON()` method
    // that misleading and not represented in the type system).
    const data = Array.isArray(range) ? { start: range[0], end: range[1] } : range

    return data
        ? {
              start: { line: data.start.line, character: data.start.character },
              end: { line: data.end.line, character: data.end.character },
          }
        : undefined
}
