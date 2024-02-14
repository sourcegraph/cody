export interface Diagnostic {
    severity: Severity
    symbol: string
    additionalInformation?: Diagnostic[]
    message: string
}

export enum Severity {}
export enum Severity {
    Error = 2,
    Warning = 1,
}
