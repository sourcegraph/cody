const selection_prompt = `
I have questions about this selected code from {fileName}:
\`\`\`
{selectedText}
\`\`\`
`

const instruction_prompt = `Please follow these rules when answering my question:
- Do not remove code that might be being used by the other part of the code that was not shared.
- Your answers and suggestions should based on the shared context only.
- Do not suggest anything that would break the working code.
- Provides full workable code when possible.

Questions: {humanInput}
`
const prevent_hallucinations =
    "Answer the questions only if you know the answer or can make a well-informed guess, else tell me you don't know it."

export const answers = {
    terminal: 'Noted. I will answer your next question based on this terminal output with the code you just shared.',
    selection: 'Noted. I will refer to this code you selected in the editor to answer your question.',
}

export const prompts = {
    selection: selection_prompt,
    instruction: instruction_prompt,
}

export const rules = {
    hallucination: prevent_hallucinations,
}
