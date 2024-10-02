import * as FormUI from '@radix-ui/react-form'
import * as React from 'react'
import { cn } from '../utils'

const FormRoot = FormUI.Root

const FormSubmit = FormUI.Submit

const Form = React.forwardRef<
    React.ElementRef<typeof FormUI.Root>,
    React.ComponentPropsWithoutRef<typeof FormUI.Root>
>(({ className, title, ...props }, ref) => (
    <FormRoot
        name={title}
        className={cn('tw-flex tw-flex-col tw-gap-2', className)}
        {...props}
        ref={ref}
    >
        {props.children}
    </FormRoot>
))

const FormField = React.forwardRef<
    React.ElementRef<typeof FormUI.Field>,
    React.ComponentPropsWithoutRef<typeof FormUI.Field>
>(({ className, ...props }, ref) => (
    <FormUI.Field
        className={cn('tw-flex tw-flex-col tw-gap-1 tw-w-full', className)}
        {...props}
        ref={ref}
    >
        {props.children}
    </FormUI.Field>
))

const FormLabel = React.forwardRef<
    React.ElementRef<typeof FormUI.Label>,
    React.ComponentPropsWithoutRef<typeof FormUI.Label>
>(({ className, title, ...props }, ref) => (
    <FormUI.Label className={cn('tw-text-muted-foreground', className)} {...props} ref={ref}>
        {title ?? props.children}
    </FormUI.Label>
))

const FormControl = React.forwardRef<
    React.ElementRef<typeof FormUI.Control>,
    React.ComponentPropsWithoutRef<typeof FormUI.Control>
>(({ className, title, ...props }, ref) => (
    <FormUI.Control
        className={cn(
            'tw-text-input-foreground tw-bg-input-background tw-border-input-border tw-py-1.5 tw-px-3 tw-rounded-md focus:tw-outline focus:tw-outline-ring',
            className
        )}
        {...props}
        ref={ref}
    />
))

const FormMessage = React.forwardRef<
    React.ElementRef<typeof FormUI.Message>,
    React.ComponentPropsWithoutRef<typeof FormUI.Message>
>(({ className, title, ...props }, ref) => (
    <FormUI.Message
        className={cn('tw-text-sm tw-text-red-500 tw-font-medium', className)}
        {...props}
        ref={ref}
    />
))

export { Form, FormField, FormLabel, FormSubmit, FormControl, FormMessage }
