import { minimatch } from 'minimatch'

export function matchesGlobPatterns(includeGlobs: string[], excludeGlobs: string[], value: string): boolean {
    const matchingIncludePattern =
        includeGlobs.length > 0 ? !!includeGlobs.find(includePattern => minimatch(value, includePattern)) : true
    if (!matchingIncludePattern) {
        return false
    }

    const matchingExcludePatttern = excludeGlobs.find(excludePattern => minimatch(value, excludePattern))
    return !matchingExcludePatttern
}
