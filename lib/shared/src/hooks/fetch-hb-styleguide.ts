import type { Message } from '../sourcegraph-api'

async function search(messages: Message[]): Promise<Message[]> {
    // async (messages) => {
    const styleguide = await fetch(
        'https://sourcegraph.com/github.com/sourcegraph/handbook@main/-/raw/content/company-info-and-process/communication/content_guidelines/style_and_mechanics.md'
    ).then(resp => resp.text())

    return messages.map((m, i) => {
        if (m.speaker === 'human' && (i === messages.length - 1 || i === messages.length - 2)) {
            m = {
                ...m,
                text: ['## Style guide', styleguide, '## User message', m.text].join('\n\n'),
            }
        }
        return m
    })
}

search([{ speaker: 'human', text: 'Hello' }]).then(
    result => console.log(result),
    error => console.error('error', error)
)
