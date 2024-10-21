import * as SelectPrimitive from '@radix-ui/react-select'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import React from 'react'
import { cn } from '../utils'

const Select = SelectPrimitive.Select
const SelectContent = SelectPrimitive.Content
const SelectGroup = SelectPrimitive.Group
const SelectLabel = SelectPrimitive.Label
const SelectValue = SelectPrimitive.Value
const SelectIcon = SelectPrimitive.Icon

const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
            'tw-flex tw-w-full tw-items-center tw-justify-between tw-rounded-md tw-border tw-border-border tw-bg-muted',
            className
        )}
        {...props}
    >
        {children}
        <SelectIcon asChild>
            <ChevronDownIcon />
        </SelectIcon>
    </SelectPrimitive.Trigger>
))

const SelectItem = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item ref={ref} className={cn('tw-w-full tw-bg-muted', className)} {...props}>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="tw-w-full tw-bg-muted">
            <CheckIcon />
        </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
))

export { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue }
