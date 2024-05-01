import type { LiteralUnion } from 'type-fest'
import { BASE_PATH } from '../../util'

export class Callsite {
    static readonly UNKNOWN_METHOD_NAME = '<unknown>'

    readonly invocation: Error & { stack?: string }
    readonly stack?: string
    constructor(depthOffset: number, error: Error = new Error()) {
        this.invocation = error
        const stack = error.stack
        const stackLines = stack?.match(/^\s*at\s.*?.*$/gm) ?? []
        this.stack = stackLines?.[depthOffset]
    }

    public get parsed(): ParsedStackLine | undefined {
        return parseStackFrameLine(this.stack)
    }
    public toJSON(): CallsiteJson {
        return this.parsed ?? {}
    }
}

export interface CallsiteJson extends ParsedStackLine {}

interface ParsedStackLine {
    fullFilePath?: string
    relativeFilePath?: string
    methodName?: LiteralUnion<typeof Callsite.UNKNOWN_METHOD_NAME, string>
    line?: number
    column?: number
}

/**
 * This parses the different stack traces and puts them into one format
 * This borrows heavily from TraceKit (https://github.com/csnover/TraceKit)
 */
export function parseStackFrameLine(line: string | undefined): ParsedStackLine | undefined {
    if (!line) {
        return undefined
    }

    const result =
        parseChrome(line) || parseWinjs(line) || parseGecko(line) || parseNode(line) || parseJSC(line)

    if (!result) {
        return undefined
    }

    //TODO: better substitution if only at the beginning of the path
    result.relativeFilePath = result.fullFilePath?.split(BASE_PATH, 1)?.[1]
    return result
}

const chromeRe =
    /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|\/|[a-z]:\\|\\\\).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i
const chromeEvalRe = /\((\S*)(?::(\d+))(?::(\d+))\)/

function parseChrome(line: string): ParsedStackLine | undefined {
    const parts = chromeRe.exec(line)

    if (!parts) {
        return
    }

    const isNative = parts[2] && parts[2].indexOf('native') === 0 // start of line
    const isEval = parts[2] && parts[2].indexOf('eval') === 0 // start of line

    const submatch = chromeEvalRe.exec(parts[2])
    if (isEval && submatch != null) {
        // throw out eval line/column and use top-most line/column number
        parts[2] = submatch[1] // url
        parts[3] = submatch[2] // line
        parts[4] = submatch[3] // column
    }

    return {
        fullFilePath: !isNative ? parts[2] : undefined,
        methodName: parts[1] || Callsite.UNKNOWN_METHOD_NAME,
        line: parts[3] ? +parts[3] : undefined,
        column: parts[4] ? +parts[4] : undefined,
    }
}

const winjsRe =
    /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i

function parseWinjs(line: string): ParsedStackLine | undefined {
    const parts = winjsRe.exec(line)

    if (!parts) {
        return
    }

    return {
        fullFilePath: parts[2],
        methodName: parts[1] || Callsite.UNKNOWN_METHOD_NAME,
        line: +parts[3],
        column: parts[4] ? +parts[4] : undefined,
    }
}

const geckoRe =
    /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i
const geckoEvalRe = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i

function parseGecko(line: string): ParsedStackLine | undefined {
    const parts = geckoRe.exec(line)

    if (!parts) {
        return
    }

    const isEval = parts[3] && parts[3].indexOf(' > eval') > -1

    const submatch = geckoEvalRe.exec(parts[3])
    if (isEval && submatch != null) {
        // throw out eval line/column and use top-most line number
        parts[3] = submatch[1]
        parts[4] = submatch[2]
        parts[5] = ''
    }

    return {
        fullFilePath: parts[3],
        methodName: parts[1] || Callsite.UNKNOWN_METHOD_NAME,
        line: parts[4] ? +parts[4] : undefined,
        column: parts[5] ? +parts[5] : undefined,
    }
}

const javaScriptCoreRe = /^\s*(?:([^@]*)(?:\((.*?)\))?@)?(\S.*?):(\d+)(?::(\d+))?\s*$/i

function parseJSC(line: string): ParsedStackLine | undefined {
    const parts = javaScriptCoreRe.exec(line)

    if (!parts) {
        return
    }

    return {
        fullFilePath: parts[3],
        methodName: parts[1] || Callsite.UNKNOWN_METHOD_NAME,
        line: +parts[4],
        column: parts[5] ? +parts[5] : undefined,
    }
}

const nodeRe =
    /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i

function parseNode(line: string): ParsedStackLine | undefined {
    const parts = nodeRe.exec(line)

    if (!parts) {
        return
    }

    return {
        fullFilePath: parts[2],
        methodName: parts[1] || Callsite.UNKNOWN_METHOD_NAME,
        line: +parts[3],
        column: parts[4] ? +parts[4] : undefined,
    }
}

// export function stackLineToStackFrame(line?: string): StackFrame {
//     if (!line) {
//         return {}
//     }

//     line = line.replace(/^\s+at\s+/gm, '')
//     const errorStackLine = line.split(' (')
//     const fullFilePath = line?.slice(-1) === ')' ? line?.match(/\(([^)]+)\)/)?.[1] : line
//     const pathArray = fullFilePath?.includes(':')
//         ? fullFilePath?.replace('file://', '')?.replace(process.cwd(), '')?.split(':')
//         : undefined
//     // order plays a role, runs from the back: column, line, path
//     const fileColumn = pathArray?.pop()
//     const fileLine = pathArray?.pop()
//     const filePath = pathArray?.pop()
//     // const filePathWithLine = fileNormalize(`${filePath}:${fileLine}`)
//     const fileName = filePath?.split('/')?.pop()
//     const fileNameWithLine = `${fileName}:${fileLine}`

//     if (filePath != null && filePath.length > 0) {
//         return {
//             fullFilePath: fullFilePath,
//             fileName: fileName,
//             fileNameWithLine: fileNameWithLine,
//             fileColumn: fileColumn,
//             fileLine: fileLine,
//             filePath: filePath,
//             // filePathWithLine: filePathWithLine,
//             method: errorStackLine?.[1] != null ? errorStackLine?.[0] : undefined,
//         }
//     }

//     return {}
// }
