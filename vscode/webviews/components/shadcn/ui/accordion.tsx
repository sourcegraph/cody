import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronRight } from 'lucide-react'
import * as React from 'react'

import { clsx } from 'clsx'

import { cn } from '../utils'
import styles from './accordion.module.css'

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
    <AccordionPrimitive.Item ref={ref} className={className} {...props} />
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className="tw-flex">
        <AccordionPrimitive.Trigger
            ref={ref}
            className={clsx(styles.accordionTrigger, className)}
            {...props}
        >
            {children}
            <ChevronRight
                className={cn('tw-h-8 tw-w-8 tw-text-muted-foreground', styles.accordionTriggerChevron)}
            />
        </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

interface AccordionContentProps
    extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> {
    overflow?: boolean
}

const AccordionContent = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Content>,
    AccordionContentProps
>(({ className, overflow, children, ...props }, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className={clsx(
            'tw-transition-all data-[state=closed]:tw-animate-accordion-up data-[state=open]:tw-animate-accordion-down',
            { 'tw-overflow-hidden': !overflow }
        )}
        {...props}
    >
        <div className={className}>{children}</div>
    </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
