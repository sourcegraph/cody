/* eslint-disable react/jsx-key */
import { json } from '@remix-run/node'
import type { V2_MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { marked } from 'marked'
import { useTable } from 'react-table'

import { getCompletions } from '../models/completions.server'

import styles from '../components/CompletionsTable.module.css'

export const meta: V2_MetaFunction = () => {
    return [{ title: 'Completions Review app' }, { name: 'description', content: 'Welcome to Completions Review app!' }]
}

export const loader = async () => {
    return json({ completions: await getCompletions() })
}

interface Column {
    Header: string
    accessor: string
}

interface Row {
    code: string
    bgColor: string
    [key: string]: string
}

export default function Index() {
    const { completions } = useLoaderData<typeof loader>()

    const columns: Column[] = [
        {
            Header: 'Code',
            accessor: 'code',
        },
    ]

    // Dynamically generated columns based on the number of generated files.
    const extraColumns = new Set<string>()

    const formatData = (inputData: typeof completions) => {
        const rows: Row[] = []

        Object.entries(inputData).forEach(([code, entries]: any) => {
            const row: Row = {
                code: renderMarkdown(code),
                bgColor: '#f7f7f7',
            }

            entries.forEach(({ completions, snapshotFileName, elapsed }: any) => {
                const columnKey = snapshotFileName

                extraColumns.add(columnKey)

                // All completions are displayed in the same cell separated by <hr />.
                row[columnKey] = `<div class="elapsed">${elapsed}ms</div>${completions
                    .map(renderMarkdown)
                    .join('<hr />')}`
            })

            rows.push(row)
        })

        columns.push(...Array.from(extraColumns).map(columnKey => ({ Header: columnKey, accessor: columnKey })))

        return rows
    }

    const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = useTable({
        columns,
        data: formatData(completions),
    })

    return (
        <div className={styles['table-wrapper']}>
            <table {...getTableProps()} className={styles.table}>
                <thead>
                    {headerGroups.map(headerGroup => (
                        <tr {...headerGroup.getHeaderGroupProps()}>
                            {headerGroup.headers.map(column => (
                                <th {...column.getHeaderProps()}>{column.render('Header')}</th>
                            ))}
                        </tr>
                    ))}
                </thead>

                <tbody {...getTableBodyProps()}>
                    {rows.map(row => {
                        prepareRow(row)

                        return (
                            <tr {...row.getRowProps()} style={{ backgroundColor: row.original.bgColor }}>
                                {row.cells.map(cell => {
                                    return (
                                        <td
                                            {...cell.getCellProps()}
                                            style={{ maxWidth: 800, overflow: 'auto' }}
                                            dangerouslySetInnerHTML={{
                                                __html: cell.value,
                                            }}
                                        />
                                    )
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function renderMarkdown(code: string) {
    const cursor = code.indexOf('🔥')

    let truncatedCode = code
    if (cursor !== -1) {
        const prefix = code.slice(0, cursor)
        const suffix = code.slice(cursor + 2)

        const splitPrefix = prefix.split('\n')
        const truncatedPrefix = splitPrefix.slice(Math.max(0, splitPrefix.length - 15)).join('\n')

        const splitSuffix = suffix.split('\n')
        const truncatedSuffix = splitSuffix.slice(0, 15).join('\n')

        truncatedCode =
            (truncatedPrefix === prefix ? '' : '// Prefix truncated\n') +
            truncatedPrefix +
            '🔥' +
            truncatedSuffix +
            (truncatedSuffix === suffix ? '' : '\n// Suffix truncated')
    }

    return marked(
        `\`\`\`javascript
${truncatedCode.replaceAll('\\', '\\\\')}
\`\`\``,
        { gfm: true }
    )
}
