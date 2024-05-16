import { ChevronsUpDownIcon } from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo, useState } from 'react'
import { cn } from '../utils'
import { Button } from './button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type Value = string

export interface SelectListOption {
    value: Value | undefined
    title: string | ReactNode
    filterKeywords?: string[]
    group?: string
    disabled?: boolean
}

export const ComboBox: FunctionComponent<{
    options: SelectListOption[]
    groupOrder?: string[]
    pluralNoun: string
    value: string | undefined
    onChange: (value: Value | undefined) => void
    onOpen?: () => void
    filter?: boolean
    disabled?: boolean
    readOnly?: boolean
    className?: string
    'aria-label'?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    options,
    groupOrder,
    pluralNoun,
    value,
    onChange,
    onOpen: parentOnOpen,
    filter,
    disabled,
    readOnly,
    className,
    'aria-label': ariaLabel,
    __storybook__open,
}) => {
    const [open, setOpen] = useState(__storybook__open && !disabled && !readOnly)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                parentOnOpen?.()
            }
            setOpen(open)
        },
        [parentOnOpen]
    )

    const optionsByGroup: { group: string; options: SelectListOption[] }[] = useMemo(() => {
        const groups = new Map<string, SelectListOption[]>()
        for (const option of options) {
            const groupOptions = groups.get(option.group ?? '')
            if (groupOptions) {
                groupOptions.push(option)
            } else {
                groups.set(option.group ?? '', [option])
            }
        }
        return Array.from(groups.entries())
            .sort((a, b) => {
                if (groupOrder) {
                    const aIndex = groupOrder.indexOf(a[0])
                    const bIndex = groupOrder.indexOf(b[0])
                    if (aIndex !== -1 && bIndex !== -1) {
                        return aIndex - bIndex
                    }
                    if (aIndex !== -1) {
                        return -1
                    }
                    if (bIndex !== -1) {
                        return 1
                    }
                }
                return a[0].localeCompare(b[0])
            })
            .map(([group, options]) => ({ group, options }))
    }, [options, groupOrder])

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="combobox"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('tw-justify-between', className)}
                    disabled={disabled || readOnly}
                    aria-label={ariaLabel}
                >
                    {value !== undefined
                        ? options.find(option => option.value === value)?.title
                        : 'Select...'}
                    {!readOnly && (
                        <ChevronsUpDownIcon
                            strokeWidth={1.25}
                            size={12}
                            className="tw-ml-3 tw-shrink-0 tw-opacity-50"
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="tw-min-w-[325px] tw-w-[unset] tw-max-w-[90%] !tw-p-0"
                align="start"
            >
                <Command
                    loop={true}
                    shouldFilter={filter}
                    filter={
                        filter
                            ? (value, search, keywords) =>
                                  [value, ...(keywords ?? [])].some(term =>
                                      term.toLowerCase().includes(search.toLowerCase())
                                  )
                                      ? 1
                                      : 0
                            : undefined
                    }
                    defaultValue={value}
                    tabIndex={0}
                    className="focus:tw-outline-none"
                >
                    <CommandList>
                        {filter && (
                            <>
                                <CommandInput placeholder={`Search ${pluralNoun}...`} />
                                <CommandEmpty>No matching {pluralNoun}</CommandEmpty>
                            </>
                        )}
                        {optionsByGroup.map(({ group, options }) => (
                            <CommandGroup heading={group} key={group}>
                                {options.map(option => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        keywords={option.filterKeywords}
                                        onSelect={currentValue => {
                                            onChange(currentValue)
                                            setOpen(false)
                                        }}
                                        disabled={option.disabled}
                                    >
                                        {option.title}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
