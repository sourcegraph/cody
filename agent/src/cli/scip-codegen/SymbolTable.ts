import { scip } from './scip'

export class SymbolTable {
    public table = new Map<string, scip.SymbolInformation>()
    public debuggingInfo: { line: string; info: scip.SymbolInformation }[] = []
    public pushDebug(info: scip.SymbolInformation): void {
        const line = new Error().stack!.split('\n')[2]
        this.debuggingInfo.push({ line, info })
    }
    constructor(public readonly index: scip.Index) {
        for (const document of index.documents) {
            this.loadSymbols(document.symbols)
        }
        this.loadSymbols(index.external_symbols)
    }

    private loadSymbols(symbols: scip.SymbolInformation[]): void {
        for (const info of symbols) {
            if (info.symbol.startsWith('local ')) {
                continue
            }
            this.table.set(info.symbol, info)
        }
    }

    public info(symbol: string): scip.SymbolInformation {
        if (symbol === '') {
            return new scip.SymbolInformation()
        }
        const result = this.table.get(symbol)
        if (!result) {
            throw new Error(
                `no symbol: ${JSON.stringify(
                    {
                        symbol,
                        debuggingInfo: this.debuggingInfo.map(({ line, info }) => ({
                            line,
                            info: info.toObject(),
                        })),
                    },
                    null,
                    2
                )}`
            )
        }
        return result
    }

    public structuralType(symbol: string): scip.SymbolInformation[] {
        const info = this.info(symbol)
        if (!info.signature.has_type_signature) {
            throw new Error('illegal state')
        }
        return info.signature.type_signature.lower_bound.structural_type.declarations.symlinks.map(
            symbol => this.info(symbol)
        )
    }
}
