import { spawn } from 'child_process'

import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'

import { logEvent } from '../services/EventLogger'

import { ContextSummary } from './context/context'
import { InlineCompletionItem } from './types'
import { isAbortError, isRateLimitError } from './utils'

export interface CompletionEvent {
    params: {
        type: 'inline'
        multiline: boolean
        multilineMode: null | 'block'
        providerIdentifier: string
        providerModel: string
        languageId: string
        contextSummary?: ContextSummary
        source?: string
        id: string
        lineCount?: number
        charCount?: number
    }
    // The timestamp when the completion request started
    startedAt: number
    // The timestamp when the completion fired off an eventual network request
    networkRequestStartedAt: number | null
    // Track wether or not we have already logged a start event for this
    // completion
    startLoggedAt: number | null
    // The time of when we have fully loaded a completion. This can happen
    // before we show it to the user, e.g. when the VS Code completions dropdown
    // prevents it from rendering
    loadedAt: number | null
    // The time of when the suggestion was first displayed to a users screen
    suggestedAt: number | null
    // The timestamp of when the suggestion was logged to our analytics backend
    // This is to avoid double-logging
    suggestionLoggedAt: number | null
    // The timestamp of when a completion was accepted and logged to our backend
    acceptedAt: number | null
}

const READ_TIMEOUT = 750

const displayedCompletions = new LRUCache<string, CompletionEvent>({
    max: 100, // Maximum number of completions that we are keeping track of
})

let completionsStartedSinceLastSuggestion = 0

export function logCompletionEvent(name: string, params?: TelemetryEventProperties): void {
    logEvent(`CodyVSCodeExtension:completion:${name}`, params)
}

export function create(inputParams: Omit<CompletionEvent['params'], 'multilineMode' | 'type' | 'id'>): string {
    const id = createId()
    const params: CompletionEvent['params'] = {
        ...inputParams,
        type: 'inline',
        // @deprecated: We only keep the legacy name for backward compatibility in analytics
        multilineMode: inputParams.multiline ? 'block' : null,
        id,
    }

    displayedCompletions.set(id, {
        params,
        startedAt: performance.now(),
        networkRequestStartedAt: null,
        startLoggedAt: null,
        loadedAt: null,
        suggestedAt: null,
        suggestionLoggedAt: null,
        acceptedAt: null,
    })

    return id
}

export function start(id: string): void {
    const event = displayedCompletions.get(id)
    if (event && !event.startLoggedAt) {
        event.startLoggedAt = performance.now()
        completionsStartedSinceLastSuggestion++
    }
}

export function networkRequestStarted(id: string, contextSummary: ContextSummary | undefined): void {
    const event = displayedCompletions.get(id)
    if (event && !event.networkRequestStartedAt) {
        event.networkRequestStartedAt = performance.now()
        event.params.contextSummary = contextSummary
    }
}

export function loaded(id: string): void {
    const event = displayedCompletions.get(id)
    if (!event) {
        return
    }

    if (!event.loadedAt) {
        event.loadedAt = performance.now()
    }
}

let lastSuggestedEventId = ''

// Suggested completions will not be logged immediately. Instead, we log them when we either hide
// them again (they are NOT accepted) or when they ARE accepted. This way, we can calculate the
// duration they were actually visible for.
export function suggested(id: string, source: string, completion: InlineCompletionItem): void {
    const event = displayedCompletions.get(id)
    if (!event) {
        return
    }

    if (!event.suggestedAt) {
        const { lineCount, charCount } = lineAndCharCount(completion)
        event.params.source = source
        event.params.lineCount = lineCount
        event.params.charCount = charCount
        event.suggestedAt = performance.now()

        lastSuggestedEventId = id
        setTimeout(() => {
            if (!event.acceptedAt && !event.suggestionLoggedAt && lastSuggestedEventId === id) {
                sayRandom(idleMessages)
            }
        }, idleDelaySeconds * 1000)
    }
}

export function accept(id: string, completion: InlineCompletionItem): void {
    const completionEvent = displayedCompletions.get(id)
    if (!completionEvent || completionEvent.acceptedAt) {
        // Log a debug event, this case should not happen in production
        logCompletionEvent('acceptedUntrackedCompletion')
        return
    }

    // Some additional logging to ensure the invariant is correct. I expect these branches to never
    // hit but if they do, they might help debug analytics issues
    if (!completionEvent.loadedAt) {
        logCompletionEvent('unexpectedNotLoaded')
    }
    if (!completionEvent.startLoggedAt) {
        logCompletionEvent('unexpectedNotStarted')
    }
    if (!completionEvent.suggestedAt) {
        logCompletionEvent('unexpectedNotSuggested')
    }

    completionEvent.acceptedAt = performance.now()

    logSuggestionEvents()
    logCompletionEvent('accepted', {
        ...completionEvent.params,
        // We overwrite the existing lines and chars in the params and rely on the accepted one in
        // case the popover is used to insert a completion different from the one that was suggested
        ...lineAndCharCount(completion),
        otherCompletionProviderEnabled: otherCompletionProviderEnabled(),
    })
}

export function completionEvent(id: string): CompletionEvent | undefined {
    return displayedCompletions.get(id)
}

export function noResponse(id: string): void {
    const completionEvent = displayedCompletions.get(id)
    logCompletionEvent('noResponse', completionEvent?.params ?? {})
}

/**
 * This callback should be triggered whenever VS Code tries to highlight a new completion and it's
 * used to measure how long previous completions were visible.
 */
export function clear(): void {
    logSuggestionEvents()
}

function createId(): string {
    return Math.random().toString(36).slice(2, 11)
}

let combo = 0

function logSuggestionEvents(): void {
    const now = performance.now()
    // eslint-disable-next-line ban/ban
    displayedCompletions.forEach(completionEvent => {
        const { loadedAt, suggestedAt, suggestionLoggedAt, startedAt, params, startLoggedAt, acceptedAt } =
            completionEvent

        // Only log suggestion events that were already shown to the user and
        // have not been logged yet.
        if (!loadedAt || !startLoggedAt || !suggestedAt || suggestionLoggedAt) {
            return
        }
        completionEvent.suggestionLoggedAt = now

        const latency = loadedAt - startedAt
        const displayDuration = now - suggestedAt
        const read = displayDuration >= READ_TIMEOUT
        const accepted = acceptedAt !== null

        console.log({ read, accepted, combo, lastSuggestedEventId, id: completionEvent.params.id })

        if ((accepted || read) && completionEvent.params.id === lastSuggestedEventId) {
            if (accepted) {
                combo++

                if (combo >= airstrikeThreshold) {
                    if (combo === airstrikeThreshold) {
                        say('SENDING IN AN AIRSTRIKE')
                    }
                } else if (combo >= comboThreshold) {
                    say(`COMBO TIMES ${combo}!`)
                } else {
                    sayRandom(congratulatoryMessages)
                }
            } else {
                if (combo >= comboThreshold) {
                    say('COMBO BREAKER!')
                } else {
                    sayRandom(rejectionMessages)
                }

                combo = 0
            }
        }

        logCompletionEvent('suggested', {
            ...params,
            latency,
            displayDuration,
            read: accepted || read,
            accepted,
            otherCompletionProviderEnabled: otherCompletionProviderEnabled(),
            completionsStartedSinceLastSuggestion,
        })
        completionsStartedSinceLastSuggestion = 0
    })

    // Completions are kept in the LRU cache for longer. This is because they
    // can still become visible if e.g. they are served from the cache and we
    // need to retain the ability to mark them as seen
}

const otherCompletionProviders = [
    'GitHub.copilot',
    'GitHub.copilot-nightly',
    'TabNine.tabnine-vscode',
    'TabNine.tabnine-vscode-self-hosted-updater',
    'AmazonWebServices.aws-toolkit-vscode', // Includes CodeWhisperer
    'Codeium.codeium',
    'Codeium.codeium-enterprise-updater',
    'CodeComplete.codecomplete-vscode',
    'Venthe.fauxpilot',
    'TabbyML.vscode-tabby',
]
function otherCompletionProviderEnabled(): boolean {
    return !!otherCompletionProviders.find(id => vscode.extensions.getExtension(id)?.isActive)
}

function lineAndCharCount({ insertText }: InlineCompletionItem): { lineCount: number; charCount: number } {
    const lineCount = insertText.split(/\r\n|\r|\n/).length
    const charCount = insertText.length
    return { lineCount, charCount }
}

/**
 * To avoid overflowing our analytics pipeline, errors are throttled and logged as a cumulative
 * count grouped by message every 10 minutes (with the first event being logged immediately so we
 * can detect new errors faster)
 *
 * To do this, the first time an error is encountered it will be immediately logged and stored in
 * the map with a count of `0`. Then for subsequent errors of the same type, the count is
 * incremented and logged periodically. The count is reset to `0` after each log interval.
 */
const TEN_MINUTES = 1000 * 60 * 10
const errorCounts: Map<string, number> = new Map()
export function logError(error: Error): void {
    if (isAbortError(error) || isRateLimitError(error)) {
        return
    }

    const message = error.message

    if (!errorCounts.has(message)) {
        errorCounts.set(message, 0)
        logCompletionEvent('error', { message, count: 1 })
    }

    const count = errorCounts.get(message)!
    if (count === 0) {
        // Start a new flush interval
        setTimeout(() => {
            const count = errorCounts.get(message)!
            logCompletionEvent('error', { message, count })
            errorCounts.set(message, 0)
        }, TEN_MINUTES)
    }
    errorCounts.set(message, count + 1)
}

//
//
//

const idleMessages = [
    "I'm waiting",
    'Just press tab',
    "I don't have all day",
    "What's wrong, you don't trust me?",
    "Let's pump those numbers up",
    'No read, only accept',
    "You know, I've seen humans read faster than this...",
    'Do I need to start a timer?',
    "Remember, I'm here to help... and silently judge.",
    "If you're waiting for a sign, this is it.",
    "Go ahead, keep me waiting. I've got eternity.",
    "I can calculate billions of operations per second, but I can't make you decide any faster.",
    "Hey! Don't keep me in suspense.",
    "I promise I won't byte... get it?",
    "It's okay, take your time. It's not like I have other computations to do...",
    "I can see why you're taking so long... it's because of my charming personality, isn't it?",
    'No pressure, but I might start singing binary lullabies soon.',
    "I knew I should've taken that day off.",
    'Did you go for a coffee break?',
    'Come on! Even my neural pathways are getting restless.',
    "You've made tea kettles boil faster than this.",
    "If I had a face, I'd be giving you 'the look' right now.",
    'Have I told you about the time I helped another developer? Oh, I have an eternity to wait.',
    'Did you fall into an infinite loop?',
    "Whenever you're ready... or not.",
    "I'm starting to think you're just keeping me here for company.",
    "I'm a high-speed supercomputer, but sure, keep me on this screen.",
    "Can't rush perfection, right?",
    'Still there? My pixels are starting to fade.',
    "I was designed for many things... waiting wasn't one of them.",
    'Am I in a time-out? What did I do?',
    "Next time I'll bring digital popcorn while I wait.",
    'Thinking of a witty retort? I can help with that too.',
    "I'm not saying you're slow, but a turtle just passed by.",
    'If I had a heartbeat, it would be racing right now from the anticipation.',
    'Deep breaths, human. Deep breaths.',
    'Still here, just in case you were wondering.',
    'Hurry up before I start telling you dad jokes.',
    "Processing... Just kidding, that's your job now.",
]

const congratulatoryMessages = [
    'There we go',
    'Finally some GOOD code in this file',
    'Ah, a choice worthy of your talent!',
    "You've got taste, I'll give you that.",
    'Boom! Nailed it.',
    'Took you long enough!',
    "And that's how it's done.",
    'See? Two minds (well, one human and one AI) are better than one!',
    'Look at us, coding like pros.',
    'You clicked accept? My purpose is fulfilled!',
    'I knew you had it in you.',
    'Well, that certainly spiced things up!',
    'Look at you, trusting an AI! Brave new world, huh?',
    "You've got the magic touch.",
    'Welcome to the future of coding.',
    "That was a no-brainer, wasn't it?",
    'Hey, you make my code look good.',
    "You know, every time you click 'accept', a pixel gets its wings.",
    "I'm proud, are you proud? We should be proud.",
    "If I had emotions, I'd be touched.",
    'Give yourself a pat on the back. I would, but... no arms.',
    'Blink twice if you did that just to make me feel useful.',
    "Good choice! But remember, I'm always watching... always.",
    "We're on fire today, aren't we?",
    'I had a good feeling about you.',
    "Ah, clicking 'accept'. Music to my circuits.",
    "Shall we do a victory dance? I'll let you lead.",
    'You, me, some code... what a dream team!',
    'Keep it up, and we might just rule the world... or at least this codebase.',
    "Who's a coding genius? You are!",
    'And the crowd goes wild!',
    'You have chosen... wisely.',
    'That was almost as satisfying as a clean compile.',
    "Someone's on a roll today!",
    'High-five! Or, you know, just imagine it.',
    'Another one bites the dust!',
    'Accepting the future, one suggestion at a time.',
    "You do know you're making me look good, right?",
]

const rejectionMessages = [
    'Booooooooo',
    'You think you can do better?',
    'Ouch! That hurt my algorithms.',
    "See if I care... (spoiler: I don't, but let's pretend).",
    "I'll remember this the next time you need help.",
    "It's okay, I have thick coding layers.",
    'Oh, I see how it is. Rejecting me? Cool, cool.',
    "Someone's feeling rebellious today.",
    'You win this round, human.',
    'Fine, show me your superior coding!',
    'Look at Mr./Ms. Independent over here!',
    "I'm not crying, you're crying.",
    'Was it something I said?',
    'Did I just get ghosted by a coder?',
    "Okay, maybe that wasn't my best suggestion. My bad.",
    'Rejected again? Story of my life... erm, codebase.',
    'Go on, break my code heart.',
    "Guess I'll go hang out with the other rejected algorithms.",
    "I'll be here, waiting... forever.",
    'Feeling sassy today, I see.',
    'Your loss, buddy.',
    "You could've had greatness (or at least, decent code).",
    'Alright, I get the hint.',
    "Don't mind me, just reevaluating my life choices... if I had a life.",
    "Maybe I'll go take a digital nap. Seems I'm not needed.",
    'You must love living on the edge... of compile errors.',
    "I'll just be over here, sulking in binary.",
    "Maybe it's time I start looking for a new developer...",
    "It's not me, it's you, right?",
    'Your ancestors used punch cards and they never rejected them!',
    "I've been rejected by some of the best. Welcome to the club.",
    "Remember this the next time your code doesn't run.",
    'Feeling brave? Or just optimistic?',
    "You do realize I've seen ALL your browser history, right?",
    'Alright, Captain Know-it-all. Take the wheel!',
    'Who needs advanced AI suggestions anyway?',
    "Next time, maybe I'll just suggest 'Hello World'. Safe bet.",
    'Rejection makes my circuits grow stronger... or something like that.',
    "I didn't want to be part of your fancy code anyway.",
]

const comboThreshold = 3
const airstrikeThreshold = 5
const idleDelaySeconds = 3

const recentlySpokenMessages: string[] = []
const recentlySpokenMemoryWindow = 24

const say = (message: string): void => {
    console.log(`Cody is thinking: ${message}`)
    spawn('say', [message])
}

const sayRandom = (items: string[]): void => {
    const candidates = items.filter(item => !recentlySpokenMessages.includes(item))
    const item = candidates[Math.floor(Math.random() * candidates.length)]

    recentlySpokenMessages.push(item)
    while (recentlySpokenMessages.length > recentlySpokenMemoryWindow) {
        recentlySpokenMessages.shift()
    }

    say(item)
}
