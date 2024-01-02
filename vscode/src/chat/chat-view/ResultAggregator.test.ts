import { describe, expect, test } from 'vitest'

import * as vscode from '../../testutils/mocks'

import { ResultAggregator } from './ResultAggregator'
import { ContextItem } from './SimpleChatModel'

interface TestContextItem extends Pick<ContextItem, 'range'> {
    uri: string
}

interface TestCase {
    title: string
    inputItems: TestContextItem[]
    expOutItems: TestContextItem[]
}

function fromTestItem(testContextItems: TestContextItem[]): ContextItem[] {
    return testContextItems.map(item => ({
        uri: vscode.Uri.parse(item.uri),
        range: item.range,
        text: '',
        source: 'unknown',
    }))
}

function toTestItem(contextItems: ContextItem[]): TestContextItem[] {
    return contextItems.map(item => ({
        uri: item.uri.toString(),
        range: item.range,
    }))
}

describe('ResultAggregator', () => {
    const cases: TestCase[] = [
        {
            title: 'one result',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
            ],
        },
        {
            title: 'two perfectly-overlapping results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
            ],
        },
        {
            title: 'two partially overlapping results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 3, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(1, 0, 4, 0),
                },
            ],
            // drop the second one
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 3, 0),
                },
            ],
        },
        {
            title: 'two adjacent results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(1, 0, 2, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(1, 0, 2, 0),
                },
            ],
        },
        {
            title: 'two non-overlapping results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(2, 0, 3, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(2, 0, 3, 0),
                },
            ],
        },
        {
            title: 'three results, 1 and 2 overlap, 2 and 3 overlap, 1 and 3 do not overlap',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 2, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(1, 0, 3, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(2, 0, 4, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 2, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(2, 0, 4, 0),
                },
            ],
        },
        {
            title: 'add full file results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
                {
                    uri: 'file:///foo/bar.ts',
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: undefined,
                },
            ],
        },
        {
            title: 'keep full file results',
            inputItems: [
                {
                    uri: 'file:///foo/bar.ts',
                },
                {
                    uri: 'file:///foo/bar.ts',
                    range: new vscode.Range(0, 0, 1, 0),
                },
            ],
            expOutItems: [
                {
                    uri: 'file:///foo/bar.ts',
                    range: undefined,
                },
            ],
        },
    ]
    for (const c of cases) {
        test(c.title, () => {
            const aggregator = new ResultAggregator()
            aggregator.addResults(fromTestItem(c.inputItems))
            expect(c.expOutItems).to.deep.equal(toTestItem(aggregator.getResults()))
        })
    }
})
