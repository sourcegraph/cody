import * as vscode from 'vscode'
import type { DecorationInfo } from '../../decorators/base'

interface MockDiffFixture {
    // Used for naming screenshots
    name: string
    // Used for syntax highlighting.
    // Should match
    lang: string
    // Diff that will be visually rendered
    diff: DecorationInfo
}

/**
 * Diff that shows multiple modified lines
 */
const CHANGE_VARIABLE_NAME = {
    name: 'change-variable-name',
    lang: 'typescript',
    diff: {
        modifiedLines: [
            {
                id: '27ab660c-39e1-4c41-ab16-8927f444bc1a',
                type: 'modified',
                originalLineNumber: 18,
                modifiedLineNumber: 18,
                oldText: '    for index in range(len(arr1)):',
                newText: '    for currentIndex in range(len(arr1)):',
                changes: [
                    {
                        id: '813d06d3-50f7-49fe-a6f3-3d01191c13a6',
                        type: 'unchanged',
                        text: '    ',
                        originalRange: new vscode.Range(18, 0, 18, 4),
                        modifiedRange: new vscode.Range(18, 0, 18, 4),
                    },
                    {
                        id: '232d724d-22c2-45b7-b82f-226bc7fb72da',
                        type: 'unchanged',
                        text: 'for',
                        originalRange: new vscode.Range(18, 4, 18, 7),
                        modifiedRange: new vscode.Range(18, 4, 18, 7),
                    },
                    {
                        id: '9b44b869-c7b4-49e4-9d83-c544054f6374',
                        type: 'unchanged',
                        text: ' ',
                        originalRange: new vscode.Range(18, 7, 18, 8),
                        modifiedRange: new vscode.Range(18, 7, 18, 8),
                    },
                    {
                        id: '80421f8b-0788-441c-bb18-a5cac6d0a9e1',
                        type: 'delete',
                        text: 'index',
                        originalRange: new vscode.Range(18, 8, 18, 13),
                        modifiedRange: new vscode.Range(18, 8, 18, 8),
                    },
                    {
                        id: '55196eda-46b0-440b-ad63-5f5e682394bd',
                        type: 'insert',
                        text: 'currentIndex',
                        originalRange: new vscode.Range(18, 13, 18, 13),
                        modifiedRange: new vscode.Range(18, 8, 18, 20),
                    },
                    {
                        id: 'e6f2e54c-feba-4998-b292-51ab1bd4360f',
                        type: 'unchanged',
                        text: ' ',
                        originalRange: new vscode.Range(18, 13, 18, 14),
                        modifiedRange: new vscode.Range(18, 20, 18, 21),
                    },
                    {
                        id: '35a13471-c329-435e-92b2-08fd960f9e2d',
                        type: 'unchanged',
                        text: 'in',
                        originalRange: new vscode.Range(18, 14, 18, 16),
                        modifiedRange: new vscode.Range(18, 21, 18, 23),
                    },
                    {
                        id: 'b49dc374-4186-4c96-8477-8936718bf6b2',
                        type: 'unchanged',
                        text: ' ',
                        originalRange: new vscode.Range(18, 16, 18, 17),
                        modifiedRange: new vscode.Range(18, 23, 18, 24),
                    },
                    {
                        id: '82959fd5-d40b-41fe-b7e0-89693d564e9a',
                        type: 'unchanged',
                        text: 'range',
                        originalRange: new vscode.Range(18, 17, 18, 22),
                        modifiedRange: new vscode.Range(18, 24, 18, 29),
                    },
                    {
                        id: 'd8781c1e-6d57-4582-99cc-b4172ccd959e',
                        type: 'unchanged',
                        text: '(',
                        originalRange: new vscode.Range(18, 22, 18, 23),
                        modifiedRange: new vscode.Range(18, 29, 18, 30),
                    },
                    {
                        id: '8be7c3ad-5b23-4f70-88cf-e004e40af101',
                        type: 'unchanged',
                        text: 'len',
                        originalRange: new vscode.Range(18, 23, 18, 26),
                        modifiedRange: new vscode.Range(18, 30, 18, 33),
                    },
                    {
                        id: '4e462eaa-70a1-48f4-a641-e24e80522532',
                        type: 'unchanged',
                        text: '(',
                        originalRange: new vscode.Range(18, 26, 18, 27),
                        modifiedRange: new vscode.Range(18, 33, 18, 34),
                    },
                    {
                        id: '76416f32-b058-4004-91f4-eda5d7c897cc',
                        type: 'unchanged',
                        text: 'arr1',
                        originalRange: new vscode.Range(18, 27, 18, 31),
                        modifiedRange: new vscode.Range(18, 34, 18, 38),
                    },
                    {
                        id: '7efe6c92-83a6-4d24-9483-2a237a658568',
                        type: 'unchanged',
                        text: ')',
                        originalRange: new vscode.Range(18, 31, 18, 32),
                        modifiedRange: new vscode.Range(18, 38, 18, 39),
                    },
                    {
                        id: '18ed0a00-6af1-47ec-9159-e8844634a60e',
                        type: 'unchanged',
                        text: ')',
                        originalRange: new vscode.Range(18, 32, 18, 33),
                        modifiedRange: new vscode.Range(18, 39, 18, 40),
                    },
                    {
                        id: '14d9a3a8-7285-4b87-b83c-a1c9a0e3c8d6',
                        type: 'unchanged',
                        text: ':',
                        originalRange: new vscode.Range(18, 33, 18, 34),
                        modifiedRange: new vscode.Range(18, 40, 18, 41),
                    },
                ],
            },
            {
                id: '5c13f3ea-c150-4b1e-ba48-f91228bc339a',
                type: 'modified',
                originalLineNumber: 19,
                modifiedLineNumber: 19,
                oldText: '        print(arr1[index])',
                newText: '        print(arr1[currentIndex])',
                changes: [
                    {
                        id: '7e3d3e1d-ea94-4f6b-b8f2-95bcda8a1b58',
                        type: 'unchanged',
                        text: '        ',
                        originalRange: new vscode.Range(19, 0, 19, 8),
                        modifiedRange: new vscode.Range(19, 0, 19, 8),
                    },
                    {
                        id: '4dd91c5b-c311-4ca1-b948-ea069bedf719',
                        type: 'unchanged',
                        text: 'print',
                        originalRange: new vscode.Range(19, 8, 19, 13),
                        modifiedRange: new vscode.Range(19, 8, 19, 13),
                    },
                    {
                        id: '08790ecc-f417-4280-8048-cefc2ac24414',
                        type: 'unchanged',
                        text: '(',
                        originalRange: new vscode.Range(19, 13, 19, 14),
                        modifiedRange: new vscode.Range(19, 13, 19, 14),
                    },
                    {
                        id: '701b4c26-231a-4963-b7a2-f33dcb7d1cfc',
                        type: 'unchanged',
                        text: 'arr1',
                        originalRange: new vscode.Range(19, 14, 19, 18),
                        modifiedRange: new vscode.Range(19, 14, 19, 18),
                    },
                    {
                        id: '0d1f7344-12bb-4cfb-92ad-be6768a82156',
                        type: 'unchanged',
                        text: '[',
                        originalRange: new vscode.Range(19, 18, 19, 19),
                        modifiedRange: new vscode.Range(19, 18, 19, 19),
                    },
                    {
                        id: '8483e4ce-2e07-4aa7-b10e-128a6bfa2c53',
                        type: 'delete',
                        text: 'index',
                        originalRange: new vscode.Range(19, 19, 19, 24),
                        modifiedRange: new vscode.Range(19, 19, 19, 19),
                    },
                    {
                        id: 'e83ff538-104d-47d9-bd8f-c9b664343c0c',
                        type: 'insert',
                        text: 'currentIndex',
                        originalRange: new vscode.Range(19, 24, 19, 24),
                        modifiedRange: new vscode.Range(19, 19, 19, 31),
                    },
                    {
                        id: '7c6641ab-b142-4ce9-a64c-fd1349464d6d',
                        type: 'unchanged',
                        text: ']',
                        originalRange: new vscode.Range(19, 24, 19, 25),
                        modifiedRange: new vscode.Range(19, 31, 19, 32),
                    },
                    {
                        id: '0e6a1fa6-8342-447e-a3c7-7da3416147e5',
                        type: 'unchanged',
                        text: ')',
                        originalRange: new vscode.Range(19, 25, 19, 26),
                        modifiedRange: new vscode.Range(19, 32, 19, 33),
                    },
                ],
            },
            {
                id: 'db96ee03-96e1-42b5-b8a4-cdbd6f99725f',
                type: 'modified',
                originalLineNumber: 20,
                modifiedLineNumber: 20,
                oldText: '        print(arr2[index])',
                newText: '        print(arr2[currentIndex])',
                changes: [
                    {
                        id: '3851a66c-42eb-4e38-b4f9-e0b7f4e1fc75',
                        type: 'unchanged',
                        text: '        ',
                        originalRange: new vscode.Range(20, 0, 20, 8),
                        modifiedRange: new vscode.Range(20, 0, 20, 8),
                    },
                    {
                        id: 'e98889e5-085c-4792-9640-a26fca392c04',
                        type: 'unchanged',
                        text: 'print',
                        originalRange: new vscode.Range(20, 8, 20, 13),
                        modifiedRange: new vscode.Range(20, 8, 20, 13),
                    },
                    {
                        id: 'ff31c177-5a4b-4456-8c9f-082ea96dc6f6',
                        type: 'unchanged',
                        text: '(',
                        originalRange: new vscode.Range(20, 13, 20, 14),
                        modifiedRange: new vscode.Range(20, 13, 20, 14),
                    },
                    {
                        id: '55c2e1c0-f54c-4962-a312-33a7cd2a4359',
                        type: 'unchanged',
                        text: 'arr2',
                        originalRange: new vscode.Range(20, 14, 20, 18),
                        modifiedRange: new vscode.Range(20, 14, 20, 18),
                    },
                    {
                        id: 'a850a25a-a418-4bfa-b829-6bed5e3d7063',
                        type: 'unchanged',
                        text: '[',
                        originalRange: new vscode.Range(20, 18, 20, 19),
                        modifiedRange: new vscode.Range(20, 18, 20, 19),
                    },
                    {
                        id: 'bdf8c605-61d3-4efc-80e8-b9b3f77a5890',
                        type: 'delete',
                        text: 'index',
                        originalRange: new vscode.Range(20, 19, 20, 24),
                        modifiedRange: new vscode.Range(20, 19, 20, 19),
                    },
                    {
                        id: '9584598a-841f-4d1e-91da-db810811398b',
                        type: 'insert',
                        text: 'currentIndex',
                        originalRange: new vscode.Range(20, 24, 20, 24),
                        modifiedRange: new vscode.Range(20, 19, 20, 31),
                    },
                    {
                        id: '2a56c977-1cad-4a9f-99e1-f926d0edc220',
                        type: 'unchanged',
                        text: ']',
                        originalRange: new vscode.Range(20, 24, 20, 25),
                        modifiedRange: new vscode.Range(20, 31, 20, 32),
                    },
                    {
                        id: 'ce8f7fda-618d-4d23-b3d5-a126d3d89cdd',
                        type: 'unchanged',
                        text: ')',
                        originalRange: new vscode.Range(20, 25, 20, 26),
                        modifiedRange: new vscode.Range(20, 32, 20, 33),
                    },
                ],
            },
            {
                id: 'fa4dbbbb-57eb-4095-87df-c50800ef6b4b',
                type: 'modified',
                originalLineNumber: 21,
                modifiedLineNumber: 21,
                oldText: '        print(arr3[index])',
                newText: '        print(arr3[currentIndex])',
                changes: [
                    {
                        id: 'e97c990b-9cfe-498e-8a98-25a8f7ea9f12',
                        type: 'unchanged',
                        text: '        ',
                        originalRange: new vscode.Range(21, 0, 21, 8),
                        modifiedRange: new vscode.Range(21, 0, 21, 8),
                    },
                    {
                        id: '521c7dce-dfc2-42b9-b1d2-92cfacf8bb12',
                        type: 'unchanged',
                        text: 'print',
                        originalRange: new vscode.Range(21, 8, 21, 13),
                        modifiedRange: new vscode.Range(21, 8, 21, 13),
                    },
                    {
                        id: '0ce674b2-16ee-45ba-8c7b-e082a3d07f11',
                        type: 'unchanged',
                        text: '(',
                        originalRange: new vscode.Range(21, 13, 21, 14),
                        modifiedRange: new vscode.Range(21, 13, 21, 14),
                    },
                    {
                        id: '1c116c10-c106-40ef-b08e-9f454c345d47',
                        type: 'unchanged',
                        text: 'arr3',
                        originalRange: new vscode.Range(21, 14, 21, 18),
                        modifiedRange: new vscode.Range(21, 14, 21, 18),
                    },
                    {
                        id: 'fccd84bd-63c5-448a-93e7-1f9154d91bd2',
                        type: 'unchanged',
                        text: '[',
                        originalRange: new vscode.Range(21, 18, 21, 19),
                        modifiedRange: new vscode.Range(21, 18, 21, 19),
                    },
                    {
                        id: 'eb09604a-fb56-49ed-979b-20b7a46673c3',
                        type: 'delete',
                        text: 'index',
                        originalRange: new vscode.Range(21, 19, 21, 24),
                        modifiedRange: new vscode.Range(21, 19, 21, 19),
                    },
                    {
                        id: '61b87a58-961e-49c9-950c-d71fbfe05ee5',
                        type: 'insert',
                        text: 'currentIndex',
                        originalRange: new vscode.Range(21, 24, 21, 24),
                        modifiedRange: new vscode.Range(21, 19, 21, 31),
                    },
                    {
                        id: 'adef5cc1-826c-4a72-88d0-c73c6d8096ea',
                        type: 'unchanged',
                        text: ']',
                        originalRange: new vscode.Range(21, 24, 21, 25),
                        modifiedRange: new vscode.Range(21, 31, 21, 32),
                    },
                    {
                        id: '8debbe29-6615-4d30-a30a-fe513de5ad8b',
                        type: 'unchanged',
                        text: ')',
                        originalRange: new vscode.Range(21, 25, 21, 26),
                        modifiedRange: new vscode.Range(21, 32, 21, 33),
                    },
                ],
            },
        ],
        removedLines: [],
        addedLines: [],
        unchangedLines: [],
    },
} satisfies MockDiffFixture

/**
 * Diff that shows a single addition line
 */
const SINGLE_LINE_ADDED = {
    name: 'single-line-added',
    lang: 'python',
    diff: {
        modifiedLines: [],
        removedLines: [],
        addedLines: [
            {
                id: '8b9ea475-fc3e-4d49-8d97-cc89d7103aca',
                type: 'added',
                modifiedLineNumber: 79,
                text: '            "created_at": self.created_at.isoformat(),',
            },
        ],
        unchangedLines: [
            {
                id: '99f87750-5d3f-456b-bfc6-02d2452cb51b',
                type: 'unchanged',
                originalLineNumber: 77,
                modifiedLineNumber: 77,
                text: '            "name": self.name,',
            },
            {
                id: 'eef73253-856f-452b-b037-74be1559b55d',
                type: 'unchanged',
                originalLineNumber: 78,
                modifiedLineNumber: 78,
                text: '            "email": self.email,',
            },
            {
                id: '567a08c2-0459-4e3a-bd72-d3efaab933d8',
                type: 'unchanged',
                originalLineNumber: 79,
                modifiedLineNumber: 80,
                text: '        }',
            },
        ],
    },
} satisfies MockDiffFixture

/**
 * Diff that shows multiple added lines, including one line that is marked as "modified" but
 * should be visually treated as an addition as there are no deletions.
 */
const MULTIPLE_LINES_ADDED = {
    name: 'multiple-lines-added',
    lang: 'javascript',
    diff: {
        modifiedLines: [
            {
                id: '3a4ba8ce-8e43-40a1-a883-377bfb63c926',
                type: 'modified',
                originalLineNumber: 27,
                modifiedLineNumber: 27,
                oldText: '  const ',
                newText: '  const onClick = () => {',
                changes: [
                    {
                        id: '3bd7686b-3508-4119-a610-4f3a0d2098c6',
                        type: 'unchanged',
                        text: '  ',
                        originalRange: new vscode.Range(27, 0, 27, 2),
                        modifiedRange: new vscode.Range(27, 0, 27, 2),
                    },
                    {
                        id: '4b68f944-cdad-4632-82e1-0f11a1b648a5',
                        type: 'unchanged',
                        text: 'const',
                        originalRange: new vscode.Range(27, 2, 27, 7),
                        modifiedRange: new vscode.Range(27, 2, 27, 7),
                    },
                    {
                        id: '55d250be-babe-4c71-8c35-6dca42cdb433',
                        type: 'unchanged',
                        text: ' ',
                        originalRange: new vscode.Range(27, 7, 27, 8),
                        modifiedRange: new vscode.Range(27, 7, 27, 8),
                    },
                    {
                        id: '045c6a4b-de2e-466e-9380-2b89d25014ea',
                        type: 'insert',
                        text: 'onClick = () => {',
                        originalRange: new vscode.Range(27, 8, 27, 8),
                        modifiedRange: new vscode.Range(27, 8, 27, 25),
                    },
                ],
            },
        ],
        removedLines: [],
        addedLines: [
            {
                id: '559d3082-5b0e-4b78-9090-2c9eb92d6879',
                type: 'added',
                modifiedLineNumber: 28,
                text: '    console.log("Clicked");',
            },
            {
                id: '94ba5b05-55b4-43b5-b78d-3a5fded16b82',
                type: 'added',
                modifiedLineNumber: 29,
                text: '  }',
            },
        ],
        unchangedLines: [
            {
                id: 'c9e9d8af-f000-4fc3-ab3d-9426514f4151',
                type: 'unchanged',
                originalLineNumber: 26,
                modifiedLineNumber: 26,
                text: 'export const Home = () => {',
            },
        ],
    },
} satisfies MockDiffFixture

export const MIXED_ADDITIONS_AND_DELETIONS = {
    name: 'mixed-additions-and-deletions',
    lang: 'typescript',
    diff: {
        modifiedLines: [
            {
                id: 'bd7a9471-3c5a-43d7-b5b3-76eb080502e5',
                type: 'modified',
                originalLineNumber: 38,
                modifiedLineNumber: 38,
                oldText: '        top 10px left 10px fixed',
                newText: "        top: '10px',",
                changes: [
                    {
                        id: '13696ddf-e2c6-4a6c-b356-4d584e7fbe20',
                        type: 'unchanged',
                        text: '        ',
                        originalRange: new vscode.Range(38, 0, 38, 8),
                        modifiedRange: new vscode.Range(38, 0, 38, 8),
                    },
                    {
                        id: '70451fe0-0c90-4953-a015-8d1996aed92d',
                        type: 'unchanged',
                        text: 'top',
                        originalRange: new vscode.Range(38, 8, 38, 11),
                        modifiedRange: new vscode.Range(38, 8, 38, 11),
                    },
                    {
                        id: '545a5a30-20c9-455a-827f-be9e870e4450',
                        type: 'delete',
                        text: ' 10px left',
                        originalRange: new vscode.Range(38, 11, 38, 21),
                        modifiedRange: new vscode.Range(38, 11, 38, 11),
                    },
                    {
                        id: '683e1ff0-e724-425e-8c00-110a15953ada',
                        type: 'insert',
                        text: ':',
                        originalRange: new vscode.Range(38, 21, 38, 21),
                        modifiedRange: new vscode.Range(38, 11, 38, 12),
                    },
                    {
                        id: 'c49a00f5-219d-4dcc-bf82-ad42b6491d57',
                        type: 'unchanged',
                        text: ' ',
                        originalRange: new vscode.Range(38, 21, 38, 22),
                        modifiedRange: new vscode.Range(38, 12, 38, 13),
                    },
                    {
                        id: '9402ca9b-7e09-4002-ad79-1aea9b7decff',
                        type: 'insert',
                        text: "'",
                        originalRange: new vscode.Range(38, 22, 38, 22),
                        modifiedRange: new vscode.Range(38, 13, 38, 14),
                    },
                    {
                        id: 'ee99a580-544b-4c5c-abc2-338937626fc9',
                        type: 'unchanged',
                        text: '10px',
                        originalRange: new vscode.Range(38, 22, 38, 26),
                        modifiedRange: new vscode.Range(38, 14, 38, 18),
                    },
                    {
                        id: 'e374f80b-a83e-4818-85bc-57403e6aea58',
                        type: 'delete',
                        text: ' fixed',
                        originalRange: new vscode.Range(38, 26, 38, 32),
                        modifiedRange: new vscode.Range(38, 18, 38, 18),
                    },
                    {
                        id: 'dcb92d8f-dcf9-470e-8e1e-f4504a57625f',
                        type: 'insert',
                        text: "',",
                        originalRange: new vscode.Range(38, 32, 38, 32),
                        modifiedRange: new vscode.Range(38, 18, 38, 20),
                    },
                ],
            },
        ],
        removedLines: [],
        addedLines: [
            {
                id: '3a5f7128-b239-4c66-b3c3-55e80f8abebe',
                type: 'added',
                modifiedLineNumber: 39,
                text: "        left: '10px',",
            },
            {
                id: 'a797e0c0-c1aa-4b04-8c41-8e3a559e70c1',
                type: 'added',
                modifiedLineNumber: 40,
                text: "        position: 'fixed',",
            },
        ],
        unchangedLines: [],
    },
} satisfies MockDiffFixture

export const MOCK_DIFFS = [
    CHANGE_VARIABLE_NAME,
    SINGLE_LINE_ADDED,
    MULTIPLE_LINES_ADDED,
    MIXED_ADDITIONS_AND_DELETIONS,
]
