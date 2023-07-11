import type { Message } from '../sourcegraph-api'

async function search(messages: Message[]): Promise<Message[]> {
    // async (messages) => {
    const searchString = 'repo:sourcegraph/sourcegraph wizardcoder'
    const url = 'https://api.github.com/search/issues?q=' + searchString
    const issues = await fetch(url).then(async response => (await response.json()).items)

    return messages.map((m, i) => {
        if (m.speaker === 'human' && (i === messages.length - 1 || i === messages.length - 2)) {
            m = {
                ...m,
                text: [
                    'Relevant issues and PRs:',
                    issues
                        .map(iss => `## ${iss.title} by ${iss.user.login} at ${iss.html_url}\n\n${iss.body}`)
                        .join('\n\n'),
                    '## User question',
                    m.text,
                    'If the question is about recent changes, reply with a bullet list of change summaries with a link to the issue or PR.',
                ].join('\n\n'),
            }
        }
        return m
    })
}

search([{ speaker: 'human', text: 'Hello' }]).then(
    result => console.log(result),
    error => console.error('error', error)
)
