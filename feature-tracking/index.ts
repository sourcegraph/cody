import { promises as fs } from 'fs'

import { ArgumentParser } from 'argparse'
import JSON5 from 'json5'

// Types describing features.json5

interface Database {
    editors?: string[],
    features: Feature[]
}

interface Feature {
    name: string,
    description?: string | undefined,
    productLine?: 'free' | 'pro' | 'consumer' | 'enterprise' | 'all',
    documentation?: string[],
    editors?: {[key: string]: EditorFeature},
    tags?: string[],
}

interface EditorFeature {
    status?: 'will-not-do' | 'planned' | 'experimental' | 'stable' | 'deprecated' | 'removed',
    notes?: string[],
}

const emptyDatabase: Database = Object.seal({
    features: [],
})

// Functions to take two Database and merge them, by overlaying the second on top of the
// first.

// Merges two feature databases. The JetBrains database is layered on top of the 'master'
// database (which happens to contain VSCode) so we can store databases with the code
// while avoiding duplication.
function mergeDb(a: Database, b: Database): Database {
    return {
        editors: mergeOptionalSet(a.editors, b.editors),
        features: mergeFeatures(a.features, b.features)
    }
}

// Merges two optional arrays, de-duping them like they were sets.
function mergeOptionalSet<T>(x: T[] | undefined, y: T[] | undefined): T[] | undefined {
    if (!x) {
        return y
    } else if (!y) {
        return x
    } else {
        return [...new Set([...x, ...y])]
    }
}

// Merges two features arrays. The features are joined by name, then recursively merged.
function mergeFeatures(xs: Feature[], ys: Feature[]): Feature[] {
    const byName = (a: Feature): [string, Feature] => [a.name, a]
    const xsByName = Object.fromEntries(xs.map(byName))
    const ysByName = Object.fromEntries(ys.map(byName))
    return Object.values(mergeMap(xsByName, ysByName, mergeFeature))
}

function mergeFeature(x: Feature, y: Feature): Feature {
    console.assert(x.name === y.name)
    // For some simple properties, we overwrite the first value with the second value, if
    // any. The second database acts as an "overlay" atop the first.
    return {
        name: x.name,
        description: y.description || x.description,
        productLine: y.productLine || x.productLine,
        documentation: mergeOptionalSet(x.documentation, y.documentation),
        editors: mergeMap(x.editors || {}, y.editors || {}, mergeEditorFeature),
        tags: mergeOptionalSet(x.tags, y.tags)
    }
}

function mergeEditorFeature(x: EditorFeature, y: EditorFeature): EditorFeature {
    return {
        status: y.status || x.status,
        notes: mergeOptionalSet(x.notes, y.notes),
    }
}

// Merges two objects used as hashes with a specific value combiner, `merge`, if the keys
// overlap.
function mergeMap<T, U extends {[key: string]: T}>(x: U, y: U, merge: (a: T, b: T) => T): {[key: string]: T} {
    const result: {[key: string]: T} = {}
    const allKeys = new Set([...Object.keys(x), ...Object.keys(y)])
    for (const key of allKeys) {
        const a = x[key]
        const b = y[key]
        if (!a) {
            result[key] = b
        } else if (!b) {
            result[key] = a
        } else {
            result[key] = merge(a, b)
        }
    }
    return result
}

// Interrogates gradle.properties to learn the upstream cody extension commit.
// async function getUpstreamCommit(): Promise<string | undefined> {
//     return (await fs.readFile(path.resolve(__dirname, '..', 'gradle.properties')))
//         .toString()
//         .split('\n')
//         .map(line => line.match(/cody.commit=([0-9a-fA-F]+)/))
//         .filter(match => match)[0]?.[1]
// }

// Merges the features in the specified files and prints the result.
async function mergeFiles(filenames: string[]) {
    const dbs = await Promise.all(filenames.map(async filename =>
        JSON5.parse((await fs.readFile(filename)).toString()) as Database
    ))
    const merged = dbs.reduce(mergeDb, emptyDatabase)
    console.log(JSON.stringify(merged, undefined, 2))
}

async function main() {
    const parser = new ArgumentParser()
    const commandParser = parser.add_subparsers({
        dest: 'command'
    })
    const mergeParser = commandParser.add_parser('merge')
    mergeParser.add_argument('file', {help: 'features.json5 file(s) to merge', nargs: '+'})
    mergeParser.add_argument('--upstream', {help: 'Include upstream features file', action: 'store_true'})
    const args = parser.parse_args()

    switch (args.command) {
        case 'merge':
            await mergeFiles(args.file)
            break
        default:
            throw new Error(`unknown command ${args.command}`)
    }
}

main()
