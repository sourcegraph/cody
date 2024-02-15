import winkUtils from 'wink-nlp-utils'

export interface JaccardMatch {
    score: number
    content: string
    startLine: number
    endLine: number
}

type WordOccurrences = Map<string, number>

/**
 * Finds the window from matchText with the highest Jaccard similarity to the targetText.
 *
 * The Jaccard similarity is the ratio of the number of words that are common to both texts
 * to the number of words that are unique to either text.
 * @param targetText is the text that serves as the target we are trying to find a match for
 * @param matchText is the text we are sliding our window through to find the best match
 * @param windowSize is the size of the match window in number of lines
 * @param maxMatches is the maximum number of matches to return
 */
export function bestJaccardMatches(
    targetText: string,
    matchText: string,
    windowSize: number,
    maxMatches: number
): JaccardMatch[] {
    if (windowSize < 1) {
        throw new Error('windowSize must be a positive integer')
    }

    // Get the bag-of-words-count dictionary for the target text
    const targetOccurrences = getWordOccurrences(targetText)
    const targetWordCounts = sumWordCounts(targetOccurrences)

    // Split the matchText into lines
    const lines = matchText.split('\n')
    const wordsForEachLine = lines.map(line => getWordOccurrences(line))

    // NOTE: Line numbers are all 0 based. For a range that only spans one line, the startLine and
    //       endLine will be the same.
    const firstWindowStart = 0
    const firstWindowEnd = Math.min(windowSize - 1, lines.length - 1)

    // Initialize the bag of words for the topmost window
    const windowOccurrences: WordOccurrences = new Map()
    for (let i = firstWindowStart; i <= firstWindowEnd; i++) {
        for (const [wordInThisLine, wordInThisLineCount] of wordsForEachLine[i].entries()) {
            windowOccurrences.set(
                wordInThisLine,
                (windowOccurrences.get(wordInThisLine) || 0) + wordInThisLineCount
            )
        }
    }
    let windowWordCounts = sumWordCounts(windowOccurrences)

    // Initialize the bag of words for the intersection of the match window and targetText
    const intersectionOccurrences = new Map<string, number>()
    for (const [word, wordCount] of targetOccurrences.entries()) {
        intersectionOccurrences.set(word, Math.min(wordCount, windowOccurrences.get(word) || 0))
    }
    let intersectionWordCounts = sumWordCounts(intersectionOccurrences)

    // Initialize the result set with the first window
    const windows: JaccardMatch[] = [
        {
            score: jaccardSimilarity(targetWordCounts, windowWordCounts, intersectionWordCounts),
            content: lines.slice(firstWindowStart, firstWindowEnd + 1).join('\n'),
            startLine: firstWindowStart,
            endLine: firstWindowEnd,
        },
    ]

    // Slide over the target text line by line
    //
    // We start at i = 1 since we already calculated the first match at startLine 0, this way, we
    // can define i as the startLine of the current window.
    //
    // Note if windowSize is smaller than the total number of lines we compare against, this loop
    // will not run.
    for (let i = 1; i <= lines.length - windowSize; i++) {
        // Subtract the words from the line we are scrolling away from
        windowWordCounts += subtract(windowOccurrences, wordsForEachLine[i - 1])
        intersectionWordCounts += subtract(intersectionOccurrences, wordsForEachLine[i - 1])

        // Add the words from the new line our window just slid over
        const { windowIncrease, intersectionIncrease } = add(
            targetOccurrences,
            windowOccurrences,
            intersectionOccurrences,
            wordsForEachLine[i + windowSize - 1]
        )
        windowWordCounts += windowIncrease
        intersectionWordCounts += intersectionIncrease

        // If the new window starts with an empty line, skip over it, unless we're at the end. This
        // will slightly increase the yield when handling source code as we don't want to have a
        // match starting with a lot of empty lines.
        //
        // Note: We use the string value of the current lines, and not the word occurrences, to
        //       determine it's truly empty and not containing some ignored characters like `//`.
        const isLastWindow = i === lines.length - windowSize
        if (lines[i].trim() === '' && !isLastWindow) {
            continue
        }

        // Compute the jaccard similarity between our target text and window
        const score = jaccardSimilarity(targetWordCounts, windowWordCounts, intersectionWordCounts)

        // TODO(@philipp-spiess): There's a potential optimization here where if the previous window
        // would overlap lines of this one and it has a higher score, we would not even need to push
        // the window until we are outside of the previous window's range. This only works in one
        // direction though so we would still need the later step of cleaning up duplicated lines

        const startLine = i
        const endLine = i + windowSize - 1
        windows.push({
            score,
            content: lines.slice(startLine, endLine + 1).join('\n'),
            startLine,
            endLine,
        })
    }

    // Rank and pick the top n results
    windows.sort((a, b) => b.score - a.score)

    // Go through the sorted list and ensure we don't yield overlapping matches
    //
    // Note: After this algorithm, we can not guarantee that every line of the target text is
    // included in the result list. However, this is per design as these gaps have a length that is
    // smaller to the window size so it's not possible to effectively rank using jaccard similarity
    // as the word bags will be vastly different if we have different number of input lines.
    //
    // In the future we may want to shrink/expand windows to ensure we have a full coverage but in
    // practice this level of complexity is not needed as we really only care about the top ranked
    // results across a number of files anyways.
    const retainedWindows: JaccardMatch[] = []
    const includedLines: Set<number> = new Set()
    for (const window of windows) {
        let hasOverlap = false
        for (let i = window.startLine; i <= window.endLine; i++) {
            if (includedLines.has(i)) {
                hasOverlap = true
                break
            }
        }

        if (!hasOverlap) {
            for (let i = window.startLine; i <= window.endLine; i++) {
                includedLines.add(i)
            }
            retainedWindows.push(window)
        }
    }

    return retainedWindows.slice(0, maxMatches)
}

function jaccardSimilarity(left: number, right: number, intersection: number): number {
    const union = left + right - intersection
    if (union < 0) {
        throw new Error("intersection can't be greater than the sum of left and right")
    }
    if (union === 0) {
        return 0
    }
    return intersection / union
}

export function getWordOccurrences(s: string): WordOccurrences {
    const frequencyCounter: WordOccurrences = new Map()
    const words = winkUtils.string.tokenize0(s)

    const filteredWords = winkUtils.tokens.removeWords(words)
    const stems = winkUtils.tokens.stem(filteredWords)
    for (const stem of stems) {
        frequencyCounter.set(stem, (frequencyCounter.get(stem) || 0) + 1)
    }
    return frequencyCounter
}

function sumWordCounts(words: Map<string, number>): number {
    let count = 0
    for (const v of words.values()) {
        count += v
    }
    return count
}

// Subtract the subtrahend bag of words from minuend and return the net change in word count
function subtract(minuend: WordOccurrences, subtrahend: WordOccurrences): number {
    let decrease = 0 // will be non-positive
    for (const [word, count] of subtrahend) {
        const currentCount = minuend.get(word) || 0
        const newCount = Math.max(0, currentCount - count)
        minuend.set(word, newCount)
        decrease += newCount - currentCount
    }
    return decrease
}

// Add incorporates a new line into window and intersection, updating each, and returns the net
// increase in size for each
function add(
    target: WordOccurrences,
    window: WordOccurrences,
    intersection: WordOccurrences,
    newLine: WordOccurrences
): { windowIncrease: number; intersectionIncrease: number } {
    let windowIncrease = 0
    let intersectionIncrease = 0
    for (const [word, count] of newLine) {
        windowIncrease += count
        window.set(word, (window.get(word) || 0) + count)

        const targetCount = target.get(word) || 0
        if (targetCount > 0) {
            const intersectionCount = intersection.get(word) || 0
            const newIntersectionCount = Math.min(count + intersectionCount, targetCount)
            intersection.set(word, newIntersectionCount)
            intersectionIncrease += newIntersectionCount - intersectionCount
        }
    }
    return { windowIncrease, intersectionIncrease }
}
