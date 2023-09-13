export interface RangeExpander {
    expandTheContextRange(input: string): Promise<string>
}
