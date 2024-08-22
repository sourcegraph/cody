import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    FILE_RANGE_TOOLTIP_LABEL,
    type MentionMenuData,
    type MentionQuery,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePromptEditorConfig } from '../../config'
import { type MentionMenuOption, createMentionMenuOption } from '../../plugins/atMentions/atMentions'
import type { setEditorQuery } from '../../plugins/atMentions/atMentions'
import { contextItemID } from '../../plugins/atMentions/util'
import styles from './MentionMenu.module.css'
import { MentionMenuContextItemContent, MentionMenuProviderItemContent } from './MentionMenuItem'
import type { MentionMenuParams } from './useMentionMenuData'

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
        setEditorQuery: setEditorQuery
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

    const mentionQuery = useMemo(
        () => parseMentionQuery(params.query ?? '', params.parentItem),
        [params.query, params.parentItem]
    )

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

            updateMentionMenuParams({ parentItem: provider })

            if (params.query !== '') {
                // Remove provider search input only and keep the rest of the query.
                setEditorQuery(currentText => {
                    const mentionStartIndex = currentText.lastIndexOf(mentionQuery.text)

                    if (mentionStartIndex !== -1) {
                        const mentionEndIndex = mentionStartIndex + mentionQuery.text.length
                        return [
                            currentText.slice(0, mentionStartIndex) + currentText.slice(mentionEndIndex),
                        ]
                    }

                    return ['']
                })
            }
            setValue(null)
        },
        [data.providers, params.query, setEditorQuery, updateMentionMenuParams, mentionQuery]
    )

    const onCommandSelect = useCallback(
        (commandSelected: string): void => {
            const item = data.items?.find(item => commandRowValue(item) === commandSelected)
            if (!item) {
                throw new Error(`No item found with value ${commandSelected}`)
            }

            // HACK: The OpenCtx interface do not support building multi-step selection for mentions.
            // For the remote file search provider, we first need the user to search for the repo from the list and then
            // put in the query to search for files. Below we are doing a hack to not set the repo item as a mention
            // but instead keep the same provider selected and put the full repo name in the query. The provider will then
            // return files instead of repos if the repo name is in the query.
            if (item.provider === 'openctx' && 'providerUri' in item) {
                if (
                    (item.providerUri === REMOTE_FILE_PROVIDER_URI &&
                        item.mention?.data?.repoName &&
                        !item.mention?.data?.filePath) ||
                    (item.providerUri === REMOTE_DIRECTORY_PROVIDER_URI &&
                        item.mention?.data?.repoName &&
                        !item.mention?.data?.directoryPath)
                ) {
                    // Do not set the selected item as mention if it is repo item from the remote file search provider.
                    // Rather keep the provider in place and update the query with repo name so that the provider can
                    // start showing the files instead.

                    updateMentionMenuParams({
                        parentItem:
                            item.providerUri === REMOTE_DIRECTORY_PROVIDER_URI
                                ? {
                                      id: REMOTE_DIRECTORY_PROVIDER_URI,
                                      title: 'Remote Directories',
                                      queryLabel: 'Enter directory path to search',
                                      emptyLabel: `No matching directories found in ${item?.mention?.data.repoName} repository`,
                                  }
                                : {
                                      id: REMOTE_FILE_PROVIDER_URI,
                                      title: 'Remote Files',
                                      queryLabel: 'Enter file path to search',
                                      emptyLabel: `No matching files found in ${item?.mention?.data.repoName} repository`,
                                  },
                    })

                    setEditorQuery(currentText => {
                        const selection = getSelection()

                        if (!selection) {
                            return [currentText]
                        }

                        const cursorPosition = selection.anchorOffset
                        const mentionStart = cursorPosition - mentionQuery.text.length
                        const mentionEndIndex = cursorPosition
                        const textToInsert = `${item.mention?.data?.repoName}:`

                        return [
                            currentText.slice(0, mentionStart) +
                                textToInsert +
                                currentText.slice(mentionEndIndex),
                            mentionStart + textToInsert.length,
                        ]
                    })

                    setValue(null)
                    return
                }
            }

            selectOptionAndCleanUp(createMentionMenuOption(item))
        },
        [data.items, selectOptionAndCleanUp, updateMentionMenuParams, setEditorQuery, mentionQuery]
    )

    // We use `cmdk` Command as a controlled component, so we need to supply its `value`. We track
    // `value` in state, but when the options change, our state `value` may refer to a row that no
    // longer exists in the list. In that case, we want the first row to be selected.
    const firstProviderRow = data.providers.at(0)
    const firstItemRow = data.items?.at(0)
    const firstRow = params.parentItem ? firstItemRow : firstProviderRow ?? firstItemRow

    const valueRow = useMemo(
        () =>
            data.providers.find(provider => commandRowValue(provider) === value) ??
            data.items?.find(item => commandRowValue(item) === value),
        [data.providers, data.items, value]
    )
    const effectiveValueRow = valueRow ?? firstRow

    const heading = getItemsHeading(params.parentItem, mentionQuery)

    const {
        commandComponents: {
            Command,
            CommandEmpty,
            CommandGroup,
            CommandItem,
            CommandList,
            CommandLoading,
        },
    } = usePromptEditorConfig()

    const providers = data.providers.map(provider => (
        // show remote repositories search provider only if the user is connected to a non-dotcom instance.
        <CommandItem
            key={commandRowValue(provider)}
            value={commandRowValue(provider)}
            onSelect={onProviderSelect}
            className={clsx(styles.item, COMMAND_ROW_CLASS_NAME)}
        >
            <MentionMenuProviderItemContent provider={provider} />
        </CommandItem>
    ))

    return (
        <Command
            loop={true}
            shouldFilter={false}
            value={effectiveValueRow ? commandRowValue(effectiveValueRow) : undefined}
            onValueChange={setValue}
            className={styles.container}
            label="@-mention context"
            ref={ref}
            data-testid="mention-menu"
        >
            <CommandList className="!tw-max-h-[unset]">
                {providers.length > 0 && (
                    <CommandGroup className={COMMAND_GROUP_CLASS_NAME}>{providers}</CommandGroup>
                )}

                {(heading || (data.items && data.items.length > 0)) && (
                    <CommandGroup heading={heading} className={COMMAND_GROUP_CLASS_NAME}>
                        {data.items?.map(item => (
                            <CommandItem
                                key={commandRowValue(item)}
                                value={commandRowValue(item)}
                                disabled={item.isIgnored}
                                onSelect={onCommandSelect}
                                className={clsx(styles.item, styles.contextItem, COMMAND_ROW_CLASS_NAME)}
                            >
                                <MentionMenuContextItemContent query={mentionQuery} item={item} />
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {data.items && data.items.length === 0 ? (
                    <CommandEmpty className={clsx(COMMAND_ROW_CLASS_NAME, COMMAND_ROW_TEXT_CLASS_NAME)}>
                        {getEmptyLabel(params.parentItem, mentionQuery)}
                    </CommandEmpty>
                ) : null}
                {data.error && (
                    <CommandLoading
                        className={clsx(COMMAND_ROW_CLASS_NAME, COMMAND_ROW_TEXT_CLASS_NAME)}
                    >
                        Error: {data.error}
                    </CommandLoading>
                )}
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
    if (!mentionQuery.text) {
        return parentItem?.queryLabel ?? 'Search...'
    }

    if (!parentItem) {
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
    return parentItem.title ?? parentItem.id
}

/**
 * Use the same padding and text size for all command rows so that there is no partially obscured
 * row (i.e., each row is the same height, and the height of the Command is an integer multiple of
 * the row height).
 *
 * If you change the height of an item from 30px, also update the `--mention-item-height` CSS variable.
 */
const COMMAND_ROW_CLASS_NAME = '!tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'

const COMMAND_ROW_TEXT_CLASS_NAME = '!tw-text-muted-foreground'

/**
 * Don't add padding around groups or show borders below groups, because that makes the total height not an integer multiple of
 * the row height.
 */
const COMMAND_GROUP_CLASS_NAME =
    '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'
