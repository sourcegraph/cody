import { AnimatePresence, motion } from 'framer-motion'
import { LoaderIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { MarkdownFromCody } from '../../components/MarkdownFromCody'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../components/shadcn/ui/accordion'
import { Cell } from '../cells/Cell'

interface ThinkingCellProps {
    isThinking: boolean
    thought: string

    isOpen: boolean
    setIsOpen: (open: boolean) => void
}

const CELL_NAME = 'thinking-space'

export function ThinkingCell({ isThinking, thought, isOpen, setIsOpen }: ThinkingCellProps) {
    const variants = {
        collapsed: {
            height: 0,
            opacity: 0,
            marginTop: 0,
            marginBottom: 0,
        },
        expanded: {
            height: 'auto',
            opacity: 1,
            marginTop: '0.5rem',
            marginBottom: '0.5rem',
        },
    }

    const [accordionValue, setAccordionValue] = useState<string | undefined>(
        isOpen ? CELL_NAME : undefined
    )

    const triggerAccordion = useCallback(() => {
        setAccordionValue(prev => {
            const prevIsOpen = prev === CELL_NAME
            setIsOpen(!prevIsOpen)
            return prevIsOpen ? undefined : CELL_NAME
        })
    }, [setIsOpen])

    return (
        <div className="tw-flex tw-flex-col tw-justify-center tw-w-full tw-gap-2 tw-mb-4">
            <Accordion
                type="single"
                collapsible={true}
                defaultValue={undefined}
                asChild={true}
                value={accordionValue}
            >
                <AccordionItem value={CELL_NAME} asChild>
                    <Cell
                        header={
                            <AccordionTrigger
                                onClick={() => triggerAccordion()}
                                title="Thought Process"
                                className="tw-flex tw-justify-center tw-items-center"
                            >
                                {isThinking ? (
                                    <LoaderIcon size={16} className="tw-animate-spin" />
                                ) : null}
                                <span className="tw-flex tw-items-baseline">
                                    {isThinking ? 'Thinking' : 'Thought Process'}
                                </span>
                            </AccordionTrigger>
                        }
                        contentClassName="tw-flex tw-flex-col tw-max-w-full"
                        data-testid="context"
                    >
                        <AccordionContent className="tw-flex tw-flex-col" overflow={false}>
                            <AnimatePresence initial={false}>
                                {isOpen ? (
                                    <motion.div
                                        key="content"
                                        initial="collapsed"
                                        animate="expanded"
                                        exit="collapsed"
                                        variants={variants}
                                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                                        style={{ overflow: 'hidden' }}
                                        className="tw-pl-4 tw-text-muted-foreground tw-dark:text-zinc-400 tw-border-l tw-flex tw-flex-col tw-gap-2"
                                    >
                                        <MarkdownFromCody>{thought}</MarkdownFromCody>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </AccordionContent>
                    </Cell>
                </AccordionItem>
            </Accordion>
        </div>
    )
}
