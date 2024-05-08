import { ChevronUpDownIcon } from '@heroicons/react/16/solid'
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
    pluralNoun: string
    value: string | undefined
    onChange: (value: Value | undefined) => void
    onOpen?: () => void
    disabled?: boolean
    readOnly?: boolean
    className?: string
    'aria-label'?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    options,
    pluralNoun,
    value,
    onChange,
    onOpen: parentOnOpen,
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
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([group, options]) => ({ group, options }))
    }, [options])

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
                        <ChevronUpDownIcon className="tw-ml-3 tw-h-5 tw-w-5 tw-shrink-0 tw-opacity-50" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="tw-min-w-[325px] tw-w-[unset] tw-max-w-[90%] !tw-p-0"
                align="start"
            >
                <Command
                    loop={true}
                    filter={(value, search, keywords) =>
                        [value, ...(keywords ?? [])].some(term =>
                            term.toLowerCase().includes(search.toLowerCase())
                        )
                            ? 1
                            : 0
                    }
                    defaultValue={value}
                    className="focus:tw-outline-none"
                >
                    <CommandList>
                        <CommandInput placeholder={`Search ${pluralNoun}...`} />
                        <CommandEmpty>No matching {pluralNoun}</CommandEmpty>
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
