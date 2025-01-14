// @ts-nocheck
/*
<<<<
import { describe, it, expect } from 'bun:test'
import { cite, citeText } from './citations'

function citationSubstring(addedText: string, responseText: string): string {
  const range = citeText(addedText, responseText)
  if (!range) {
    return ''
  }
  return addedText.slice(range.startOffset, range.endOffset)
}

describe('citations', () => {
  it('exact match with whitespace diff', () => {
    const original = 'hello ("world")'
    expect(citationSubstring(original, `hello("world")`)).toStrictEqual(original)
  })

  it.only('first hunk', () => {
    expect(citationSubstring(`hello("world") // comment`, `hello("world", 32, "goodbye")`)).toStrictEqual(`hello("world")`)
  })

  it('last hunk', () => {
    expect(citationSubstring(`hello("world", 32) // comment`, `helloYes("world", 32) // comment`)).toStrictEqual(`world`)
  })
})
====
import { describe, it, expect } from 'bun:test'
import { cite, citeText } from './citations'

function citationSubstring(param: {addedText: string, responseText: string}): string {
  const range = citeText(param.addedText, param.responseText)
  if (!range) {
    return ''
  }
  return param.addedText.slice(range.startOffset, range.endOffset)
}

describe('citations', () => {
  it('exact match with whitespace diff', () => {
    const original = 'hello ("world")'
    expect(citationSubstring({addedText: original, responseText: `hello("world")`})).toStrictEqual(original)
  })

  it.only('first hunk', () => {
    expect(citationSubstring({addedText: `hello("world") // comment`, responseText: `hello("world", 32, "goodbye")`})).toStrictEqual(`hello("world")`)
  })

  it('last hunk', () => {
    expect(citationSubstring({addedText: `hello("world", 32) // comment`, responseText: `helloYes("world", 32) // comment`})).toStrictEqual(`world`)
  })
})
>>>>
*/



import { describe, it, expect } from 'bun:test'
import { citeText } from './citations'

function citationSubstring(addedText: string, responseText: string): string {
  const range = citeText(addedText, responseText)
  if (!range) {
    return ''
  }
  return addedText.slice(range.startOffset, range.endOffset)
}

describe('citations', () => {
  it('exact match with whitespace diff', () => {
    const original = 'hello ("world")'
    expect(citationSubstring(original, `hello("world")`)).toStrictEqual(original)
  })

  it.only('first hunk', () => {
    expect(citationSubstring(`hello("world") // comment`, `hello("world", 32, "goodbye")`)).toStrictEqual(`hello("world")`)
  })

  it('last hunk', () => {
    expect(citationSubstring(`hello("world", 32) // comment`, `helloYes("world", 32) // comment`)).toStrictEqual(`world`)
  })
})
