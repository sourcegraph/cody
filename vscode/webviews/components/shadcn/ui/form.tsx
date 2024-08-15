import * as FormUI from '@radix-ui/react-form'
import * as React from 'react'
import { cn } from '../utils'

const FormRoot = FormUI.Root

const FormField = FormUI.Field
const FormControl = FormUI.Control
const FormMessage = FormUI.Message
const FormSubmit = FormUI.Submit

const Form = React.forwardRef<
    React.ElementRef<typeof FormUI.Root>,
    React.ComponentPropsWithoutRef<typeof FormUI.Root>
>(({ className, title, ...props }, ref) => (
    <FormRoot name={title} className={className} {...props}>
        {props.children}
    </FormRoot>
))

const FormLabel = React.forwardRef<
    React.ElementRef<typeof FormUI.Label>,
    React.ComponentPropsWithoutRef<typeof FormUI.Label>
>(({ className, title, ...props }, ref) => (
    <FormUI.Label className={cn('tw-text-accent-foreground', className)} {...props}>
        {title ?? props.children}
    </FormUI.Label>
))

export { Form, FormField, FormLabel, FormSubmit, FormControl, FormMessage }
