import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    FILE_RANGE_TOOLTIP_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
} from '../../../src/chat/context/constants'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
    CommandLoading,
    CommandSeparator,
} from '../../components/shadcn/ui/command'
import {
    type MentionMenuOption,
    createMentionMenuOption,
} from '../../promptEditor/plugins/atMentions/atMentions'
import { contextItemID } from '../../promptEditor/plugins/atMentions/util'
import styles from './MentionMenu.module.css'
import { MentionMenuContextItemContent, MentionMenuProviderItemContent } from './MentionMenuItem'
import type { MentionMenuData, MentionMenuParams } from './useMentionMenuData'

/**
 * The menu for @-mentioning context in a chat message.
 *
 * - A menu item either (1) inserts an @-mention of a context item or (2) navigates the user one
 *   level deeper in the menu.
 * - The root level of the menu shows the context providers by type and some suggestions for context
 *   items.
 * - The 2nd level of the menu shows the context items for a given provider.
 *
 * This menu is visually attached to a Lexical editor instance. Lexical's LexicalMenu tracks the
 * selected-index state for its attached menus and handles keyboard events (such as up/down arrow
 * and enter/tab). Unfortunately, LexicalMenu's assumptions do not work for the MentionMenu because
 * not all items are insertable. Therefore, we need to override LexicalMenu's keyboard event
 * handlers and use our own, and track our own selected-index state.
 */
export const MentionMenu: FunctionComponent<
    {
        params: MentionMenuParams
        updateMentionMenuParams: (update: Partial<Pick<MentionMenuParams, 'parentItem'>>) => void
        setEditorQuery: (query: string) => void
        data: MentionMenuData

        /** For use in storybooks only. */
        __storybook__focus?: boolean
    } & Pick<Parameters<MenuRenderFn<MentionMenuOption>>[1], 'selectOptionAndCleanUp'>
> = ({
    params,
    updateMentionMenuParams,
    setEditorQuery,
    data,
    __storybook__focus,
    selectOptionAndCleanUp,
}) => {
    const ref = useRef<HTMLDivElement>(null)

    const [value, setValue] = useState<string | null>(null)

    const mentionQuery = parseMentionQuery(params.query ?? '', params.parentItem)

    useEffect(() => {
        if (__storybook__focus) {
            ref.current?.focus()
        }
    }, [__storybook__focus])

    // Register global keydown listener for keys handled by LexicalMenu to intercept them and pass
    // them onto `cmdk`, so that we can rely on `cmdk`'s built-in key handling.
    useEffect(() => {
        let lastRedispatched: KeyboardEvent | undefined
        const CMDK_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Home', 'Tab', 'End']
        const listener = (e: KeyboardEvent) => {
            if (e !== lastRedispatched && CMDK_KEYS.includes(e.key)) {
                e.preventDefault()
                e.stopPropagation()
                lastRedispatched = new KeyboardEvent('keydown', {
                    bubbles: true,
                    // Make <Tab> behave like <Enter>.
                    key: e.key === 'Tab' ? 'Enter' : e.key,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                })
                ref.current?.dispatchEvent(lastRedispatched)
            }
        }
        window.addEventListener('keydown', listener, { capture: true })
        return () => window.removeEventListener('keydown', listener, { capture: true })
    }, [])

    const onProviderSelect = useCallback(
        (value: string): void => {
            const provider = data.providers.find(p => commandRowValue(p) === value)
            if (!provider) {
                throw new Error(`No provider found with value ${value}`)
            }

            if (params.query !== '') {
                setEditorQuery('')
            }
            updateMentionMenuParams({ parentItem: provider })
            setValue(null)
        },
        [data.providers, params.query, setEditorQuery, updateMentionMenuParams]
    )

    const onCommandSelect = useCallback(
        (value: string): void => {
            const item = data.items?.find(item => commandRowValue(item) === value)
            if (!item) {
                throw new Error(`No item found with value ${value}`)
            }
            selectOptionAndCleanUp(createMentionMenuOption(item))
        },
        [data.items, selectOptionAndCleanUp]
    )

    // We use `cmdk` Command as a controlled component, so we need to supply its `value`. We track
    // `value` in state, but when the options change, our state `value` may refer to a row that no
    // longer exists in the list. In that case, we want the first row to be selected.
    const firstRow = data.providers.at(0) ?? data.items?.at(0)
    const valueRow = useMemo(
        () =>
            data.providers.find(provider => commandRowValue(provider) === value) ??
            data.items?.find(item => commandRowValue(item) === value),
        [data.providers, data.items, value]
    )
    const effectiveValueRow = valueRow ?? firstRow

    const heading = getItemsHeading(params.parentItem, mentionQuery)

    return (
        <Command
            loop={true}
            shouldFilter={false}
            value={effectiveValueRow ? commandRowValue(effectiveValueRow) : undefined}
            onValueChange={setValue}
            className={styles.container}
            label="@-mention context"
            ref={ref}
        >
            <CommandList>
                {data.providers.length > 0 && (
                    <CommandGroup>
                        {data.providers.map(provider => (
                            <CommandItem
                                key={commandRowValue(provider)}
                                value={commandRowValue(provider)}
                                onSelect={onProviderSelect}
                                className={styles.item}
                            >
                                <MentionMenuProviderItemContent provider={provider} />
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandGroup heading={heading}>
                    {heading && params.parentItem && <CommandSeparator />}
                    {data.items ? (
                        data.items.length > 0 ? (
                            data.items.map(item => (
                                <CommandItem
                                    key={commandRowValue(item)}
                                    value={commandRowValue(item)}
                                    disabled={item.isIgnored}
                                    onSelect={onCommandSelect}
                                    className={clsx(styles.item, styles.contextItem)}
                                >
                                    <MentionMenuContextItemContent query={mentionQuery} item={item} />
                                </CommandItem>
                            ))
                        ) : (
                            <CommandEmpty>{getEmptyLabel(params.parentItem, mentionQuery)}</CommandEmpty>
                        )
                    ) : (
                        <CommandLoading>Loading...</CommandLoading>
                    )}
                </CommandGroup>
            </CommandList>
        </Command>
    )
}

function commandRowValue(
    row: MentionMenuData['providers'][number] | NonNullable<MentionMenuData['items']>[number]
): string {
    if ('id' in row) {
        row satisfies ContextMentionProviderMetadata
        return `provider:${row.id}`
    }

    row satisfies ContextItem
    return contextItemID(row)
}

function getEmptyLabel(
    parentItem: ContextMentionProviderMetadata | null,
    mentionQuery: MentionQuery
): string {
    if (!parentItem) {
        if (mentionQuery.text.length === 0) {
            return 'Enter a file path to include the file in the context'
        }
        return FILE_CONTEXT_MENTION_PROVIDER.emptyLabel!
    }
    if (parentItem.id === SYMBOL_CONTEXT_MENTION_PROVIDER.id && mentionQuery.text.length < 3) {
        return SYMBOL_CONTEXT_MENTION_PROVIDER.emptyLabel! + NO_SYMBOL_MATCHES_HELP_LABEL
    }
    return parentItem.emptyLabel ?? 'No results'
}

function getItemsHeading(
    parentItem: ContextMentionProviderMetadata | null,
    mentionQuery: MentionQuery
): string {
    if (
        (!parentItem || parentItem.id === FILE_CONTEXT_MENTION_PROVIDER.id) &&
        mentionQuery.maybeHasRangeSuffix
    ) {
        return FILE_RANGE_TOOLTIP_LABEL
    }
    if (!parentItem) {
        return ''
    }
    if (
        parentItem.id === SYMBOL_CONTEXT_MENTION_PROVIDER.id ||
        parentItem.id === FILE_CONTEXT_MENTION_PROVIDER.id
    ) {
        // Don't show heading for these common types because it's just noisy.
        return ''
    }
    return parentItem.queryLabel ?? parentItem.title ?? parentItem.id
}
