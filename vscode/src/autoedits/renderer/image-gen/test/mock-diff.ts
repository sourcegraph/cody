import * as vscode from 'vscode'
import type { DecorationInfo } from '../../decorators/base'

export const MOCK_DIFF = {
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
    unchangedLines: [
        {
            id: '66eae783-5158-42bb-8b7c-5543e0923591',
            type: 'unchanged',
            originalLineNumber: 0,
            modifiedLineNumber: 0,
            text: '"""',
        },
        {
            id: '26c852e4-e4dc-46dd-9b80-0b5ed5a4729a',
            type: 'unchanged',
            originalLineNumber: 1,
            modifiedLineNumber: 1,
            text: '<<<<',
        },
        {
            id: 'ca6b1d89-4910-49d2-9be8-7d6bf28efef2',
            type: 'unchanged',
            originalLineNumber: 2,
            modifiedLineNumber: 2,
            text: 'def debug(arr1, arr2, arr3):',
        },
        {
            id: '2fd98bd4-a910-4d99-9f4b-67ce19f1d7d1',
            type: 'unchanged',
            originalLineNumber: 3,
            modifiedLineNumber: 3,
            text: '    for index in range(len(arr1)):',
        },
        {
            id: '222fb521-62d2-4a3f-bba4-8f48845f6bd9',
            type: 'unchanged',
            originalLineNumber: 4,
            modifiedLineNumber: 4,
            text: '        print(arr1[index])',
        },
        {
            id: '1a28c50a-6f8f-4dc2-b58d-903660eeabfc',
            type: 'unchanged',
            originalLineNumber: 5,
            modifiedLineNumber: 5,
            text: '        print(arr2[index])',
        },
        {
            id: '1be562c8-4bcb-4bcb-9619-1fd543e90dee',
            type: 'unchanged',
            originalLineNumber: 6,
            modifiedLineNumber: 6,
            text: '        print(arr3[index])',
        },
        {
            id: '1c1ddd24-839d-44be-ad42-250231ece0fe',
            type: 'unchanged',
            originalLineNumber: 7,
            modifiedLineNumber: 7,
            text: '====',
        },
        {
            id: '6be5d8f3-b935-4e13-94f9-4c85a3a1489c',
            type: 'unchanged',
            originalLineNumber: 8,
            modifiedLineNumber: 8,
            text: 'def debug(arr1, arr2, arr3):',
        },
        {
            id: 'c956f3f0-73f6-4f70-be56-21db04406ed1',
            type: 'unchanged',
            originalLineNumber: 9,
            modifiedLineNumber: 9,
            text: '    for currentIndex in range(len(arr1)):',
        },
        {
            id: 'c828b053-88a1-4eb8-ab14-0320b96c5509',
            type: 'unchanged',
            originalLineNumber: 10,
            modifiedLineNumber: 10,
            text: '        print(arr1[currentIndex])',
        },
        {
            id: '8f86bcfb-9cc3-4bdd-ac77-fd044d9e06df',
            type: 'unchanged',
            originalLineNumber: 11,
            modifiedLineNumber: 11,
            text: '        print(arr2[currentIndex])',
        },
        {
            id: 'd8a8309f-1842-4846-a346-227c449420f4',
            type: 'unchanged',
            originalLineNumber: 12,
            modifiedLineNumber: 12,
            text: '        print(arr3[currentIndex])',
        },
        {
            id: 'cbb2e905-4672-4ec6-b87a-f594a1b14d3b',
            type: 'unchanged',
            originalLineNumber: 13,
            modifiedLineNumber: 13,
            text: '>>>>',
        },
        {
            id: '1ffb7528-5298-403b-b52c-f6578a1494f7',
            type: 'unchanged',
            originalLineNumber: 14,
            modifiedLineNumber: 14,
            text: '"""',
        },
        {
            id: '8cdd6d67-886e-4ccf-82c1-72278233940f',
            type: 'unchanged',
            originalLineNumber: 15,
            modifiedLineNumber: 15,
            text: '',
        },
        {
            id: 'fef0133a-a86d-4256-a945-97492cf9ef97',
            type: 'unchanged',
            originalLineNumber: 16,
            modifiedLineNumber: 16,
            text: '',
        },
        {
            id: 'fac65cfd-3fa4-4bec-b312-d7e82e19e806',
            type: 'unchanged',
            originalLineNumber: 17,
            modifiedLineNumber: 17,
            text: 'def debug(arr1, arr2, arr3):',
        },
        {
            id: '2b74d3e9-3f2b-4466-9686-cb5c11fefd64',
            type: 'unchanged',
            originalLineNumber: 22,
            modifiedLineNumber: 22,
            text: '',
        },
    ],
} satisfies DecorationInfo
