import winkUtils from 'wink-nlp-utils'

export interface JaccardMatch {
    score: number
    content: string
    startLine: number
    endLine: number
}

type WordOccurrences = Map<string, number>

/**
 * Finds the window from matchText with the lowest Jaccard distance from targetText.
 * The Jaccard distance is the ratio of intersection over union, using a bag-of-words-with-count as
 * the representation for text snippet.
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
    // Get the bag-of-words-count dictionary for the target text
    const targetWords = getWordOccurrences(targetText)
    const targetCount = sumWordCounts(targetWords)

    // Split the matchText into lines
    const lines = matchText.split('\n')
    const wordsForEachLine = lines.map(line => getWordOccurrences(line))

    // Initialize the bag of words for the topmost window
    const firstWindowStart = 0
    const firstWindowEnd = Math.min(windowSize, lines.length)
    const windowWords: WordOccurrences = new Map()
    for (let i = firstWindowStart; i < firstWindowEnd; i++) {
        for (const [wordInThisLine, wordInThisLineCount] of wordsForEachLine[i].entries()) {
            windowWords.set(wordInThisLine, (windowWords.get(wordInThisLine) || 0) + wordInThisLineCount)
        }
    }

    let windowCount = sumWordCounts(windowWords)
    // Initialize the bag of words for the intersection of the match window and targetText
    const bothWords = new Map<string, number>()
    for (const [word, wordCount] of targetWords.entries()) {
        bothWords.set(word, Math.min(wordCount, windowWords.get(word) || 0))
    }
    let bothCount = sumWordCounts(bothWords)

    // Initialize the result set with the first window
    const windows: JaccardMatch[] = [
        {
            score: jaccardDistance(targetCount, windowCount, bothCount),
            content: lines.slice(firstWindowStart, firstWindowEnd).join('\n'),
            startLine: firstWindowStart,
            endLine: firstWindowEnd,
        },
    ]

    // Slide over the target text line by line
    //
    // We start at 1 since we already calculated the first match at startLine 0,
    // this way, i can refer to the startLine of the current window
    for (let i = 1; i <= lines.length - windowSize; i++) {
        // Subtract the words from the line we are scrolling away from
        windowCount += subtract(windowWords, wordsForEachLine[i - 1])
        bothCount += subtract(bothWords, wordsForEachLine[i - 1])

        // Add the words from the new line our window just slid over
        const { windowIncrease, intersectionIncrease } = add(
            targetWords,
            windowWords,
            bothWords,
            wordsForEachLine[i + windowSize - 1]
        )
        windowCount += windowIncrease
        bothCount += intersectionIncrease

        // If the new window starts with an empty line, skip over it, unless we're at the end. This
        // will slightly increase the yield when handling with source code as
        // we don't want to have a match starting with a lot of empty lines.
        //
        // Note: We use the string value of the current lines, and not the word occurrences, to
        // determine it's truly empty
        const isLastWindow = i === lines.length - windowSize
        if (lines[i].trim() === '' && !isLastWindow) {
            continue
        }

        // compute the jaccard distance between our target text and window
        const score = jaccardDistance(targetCount, windowCount, bothCount)
        const startLine = i
        const endLine = i + windowSize
        windows.push({ score, content: lines.slice(startLine, endLine).join('\n'), startLine, endLine })
    }

    windows.sort((a, b) => b.score - a.score)

    return windows.slice(0, maxMatches)
}

export function jaccardDistance(left: number, right: number, intersection: number): number {
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
