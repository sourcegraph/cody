import Anthropic from '@anthropic-ai/sdk'

interface CacheUsage {
    // Current metrics
    input_tokens: number
    output_tokens: number
    // Future cache metrics
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
}

const romeoAndJulietText = `
PROLOGUE
Two households, both alike in dignity,
In fair Verona, where we lay our scene,
From ancient grudge break to new mutiny,
Where civil blood makes civil hands unclean.

ACT 1, SCENE 1
[A public place in Verona. Enter SAMPSON and GREGORY, armed with swords and bucklers]

SAMPSON:
Gregory, on my word, we'll not carry coals.
GREGORY:
No, for then we should be colliers.
SAMPSON:
I mean, an we be in choler, we'll draw.
GREGORY:
Ay, while you live, draw your neck out of collar.

[... detailed scene descriptions and dialogue...]

ACT 2, SCENE 2
[Capulet's orchard. Enter ROMEO]

ROMEO:
But, soft! what light through yonder window breaks?
It is the east, and Juliet is the sun.
Arise, fair sun, and kill the envious moon,
Who is already sick and pale with grief,
That thou her maid art far more fair than she.

JULIET:
O Romeo, Romeo! wherefore art thou Romeo?
Deny thy father and refuse thy name;
Or, if thou wilt not, be but sworn my love,
And I'll no longer be a Capulet.

[... extensive dialogue and scenes...]

ACT 3 - The Tragedy Unfolds
[Detailed descriptions of the conflicts, fights, and tragic events]

ACT 4 - The Plan
[Friar Lawrence's scheme and its implementation]

ACT 5 - The Final Scene
[The tragic ending in the tomb]`.repeat(10)

// Add historical context and analysis
const literaryAnalysis = `
HISTORICAL CONTEXT AND ANALYSIS

1. SHAKESPEAREAN CONTEXT
- Written between 1591-1595
- Performed at the Globe Theatre
- Influence of Italian literature

2. MAJOR THEMES
- Love vs. Hate
- Fate and Fortune
- Youth vs. Age
- Light and Darkness

3. CHARACTER ANALYSIS
[Detailed character studies...]

4. LITERARY DEVICES
[Analysis of metaphors, symbols...]`.repeat(5)

const fullText = romeoAndJulietText + literaryAnalysis

interface LatencyMetrics {
    networkLatency: number
    processingTime: number
    totalTime: number
    usage: CacheUsage
}

async function testCaching() {
    const client = new Anthropic({
        apiKey: '',
    })
    // Store metrics for comparison
    // const results: LatencyMetrics[] = []
    // Test cases with identical content to trigger cache
    for (let i = 0; i < 5; i++) {
        const requestStart = performance.now()
        const networkStart = performance.now()
        let input = {
            model: 'claude-3-5-sonnet-latest',
            max_tokens: 1024,
            system: [
                {
                    type: 'text',
                    text: 'hello. You are an AI assistant tasked with analyzing books.',
                },
                {
                    type: 'text',
                    text:
                        'Here is the full text of a book: [Please insert full text of a 50-page book]' +
                        fullText,
                    cache_control: { type: 'ephemeral' },
                },
            ] as any,
            messages: [
                {
                    role: 'user',
                    content: 'What are the key plots?',
                } as any,
            ],
        }
        if (i === 0) {
            input = {
                model: 'claude-3-5-sonnet-latest',
                max_tokens: 1024,
                system: [
                    {
                        type: 'text',
                        text: 'hello. You are an AI assistant tasked with analyzing books.',
                    },
                    {
                        type: 'text',
                        text:
                            'Here is the full text of a book: [Please insert full text of a 50-page book]' +
                            fullText,
                    },
                ] as any,
                messages: [
                    {
                        role: 'user',
                        content: 'What are the key plots?',
                    } as any,
                ],
            }
        }
        const response = await client.beta.tools.messages.create(input)
        const requestEnd = performance.now()
        // Extract both current and future cache metrics
        const metrics: LatencyMetrics = {
            networkLatency: networkStart - requestStart,
            processingTime: requestEnd - networkStart,
            totalTime: requestEnd - requestStart,
            usage: {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
                // Future fields marked as optional
                cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
                cache_read_input_tokens: (response.usage as any).cache_read_input_tokens,
            },
        }
        console.log('Cache Performance Metrics:')
        console.log('Input Tokens:', metrics.usage.input_tokens)
        console.log('Output Tokens:', metrics.usage.output_tokens)
        if (metrics.usage.cache_creation_input_tokens !== undefined) {
            console.log('Cache Creation Tokens:', metrics.usage.cache_creation_input_tokens)
        }
        if (metrics.usage.cache_read_input_tokens !== undefined) {
            console.log('Cache Read Tokens:', metrics.usage.cache_read_input_tokens)
        }
        console.log('networkLatency:', metrics.networkLatency)
        console.log('processingTime:', metrics.processingTime)
        console.log('toalTime:', metrics.totalTime)
        console.log('---\n')
        await new Promise(resolve => setTimeout(resolve, 100))
    }
}
testCaching().catch(console.error)
/**
➜  shared git:(jlxu/addInteractionID) ✗ pnpm exec node --loader ts-node/esm src/llm-providers/anthropic/prompt-cache.ts
Debugger listening on ws://127.0.0.1:60357/d86a8862-1b1c-4ed1-b6d0-366e2aed453a
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.
(node:47777) ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 353
Cache Creation Tokens: 4328
Cache Read Tokens: 0
networkLatency: 0.0022910237312316895
processingTime: 6634.125416994095
toalTime: 6634.127708017826
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 357
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.002459019422531128
processingTime: 6591.8445409834385
toalTime: 6591.847000002861
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 298
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0010830163955688477
processingTime: 5527.989124983549
toalTime: 5527.990207999945
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 317
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0021669864654541016
processingTime: 6418.388332992792
toalTime: 6418.390499979258
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 316
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0017919838428497314
processingTime: 5371.879958003759
toalTime: 5371.881749987602
---

Waiting for the debugger to disconnect...
 */
/**
➜  shared git:(jlxu/addInteractionID) ✗ pnpm exec node --loader ts-node/esm src/llm-providers/anthropic/prompt-cache.ts
Debugger listening on ws://127.0.0.1:60357/d86a8862-1b1c-4ed1-b6d0-366e2aed453a
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.
(node:47777) ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 353
Cache Creation Tokens: 4328
Cache Read Tokens: 0
networkLatency: 0.0022910237312316895
processingTime: 6634.125416994095
toalTime: 6634.127708017826
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 357
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.002459019422531128
processingTime: 6591.8445409834385
toalTime: 6591.847000002861
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 298
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0010830163955688477
processingTime: 5527.989124983549
toalTime: 5527.990207999945
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 317
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0021669864654541016
processingTime: 6418.388332992792
toalTime: 6418.390499979258
---

Cache Performance Metrics:
Input Tokens: 18
Output Tokens: 316
Cache Creation Tokens: 0
Cache Read Tokens: 4328
networkLatency: 0.0017919838428497314
processingTime: 5371.879958003759
toalTime: 5371.881749987602
---

Waiting for the debugger to disconnect...
 */
