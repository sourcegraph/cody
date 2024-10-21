import * as Progress from '@radix-ui/react-progress'
import { clsx } from 'clsx'
import { ArrowRight, BookText, LucideExternalLink, PencilRuler, SquareChevronRight } from 'lucide-react'
import type { FC } from 'react'

import { LoadingDots } from '../../chat/components/LoadingDots'
import { Button } from '../../components/shadcn/ui/button'

import styles from './PromptsMigration.module.css'

type PromptsMigrationProps =
    | { status: 'initial'; isMigrationAvailable: boolean }
    | { status: 'loading'; migratedPrompts: number; promptsToMigrate: number | undefined }
    | { status: 'error'; errorMessage: string }
    | { status: 'finished' }

export const PromptsMigration: FC<PromptsMigrationProps> = props => {
    const { status } = props

    return (
        <div className={styles.root}>
            <header className={clsx('tw-text-muted-foreground', styles.iconsHeader)}>
                <PencilRuler size={20} />
                <ArrowRight size={20} />
                <BookText size={20} />
            </header>

            {status === 'initial' && (
                <PromptsMigrationInitial isMigrationAvailable={props.isMigrationAvailable} />
            )}

            {status === 'loading' && (
                <PromptsMigrationLoading
                    migratedPrompts={props.migratedPrompts}
                    promptsToMigrate={props.promptsToMigrate}
                />
            )}

            {status === 'error' && <PromptMigrationFailed errorMessage={props.errorMessage} />}
            {status === 'finished' && <PromptMigrationSuccess />}
        </div>
    )
}

interface PromptsMigrationInitial {
    isMigrationAvailable: boolean
}

const PromptsMigrationInitial: FC<PromptsMigrationInitial> = props => {
    const { isMigrationAvailable } = props

    return (
        <>
            <h3 className={styles.heading}>Commands are now Prompts</h3>

            <span className={styles.descriptionText}>
                Prompts are assuming the features of commands, including custom commands.
            </span>

            <div className={styles.actions}>
                {isMigrationAvailable && (
                    <Button variant="default" className={styles.action}>
                        <SquareChevronRight size={16} />
                        Migrate commands
                    </Button>
                )}

                <Button variant="outline" className={styles.action}>
                    Explore docs
                    <LucideExternalLink size={16} />
                </Button>
            </div>

            {isMigrationAvailable && (
                <span className={clsx(styles.footer, 'tw-text-muted-foreground')}>
                    Migrate your local custom commands into prompts to keep them.{' '}
                    <span className="tw-underline">Commands will be deprecated.</span>
                </span>
            )}
        </>
    )
}

interface PromptsMigrationLoadingProps {
    migratedPrompts: number
    promptsToMigrate: number | undefined
}

const PromptsMigrationLoading: FC<PromptsMigrationLoadingProps> = props => {
    const { migratedPrompts, promptsToMigrate } = props
    const isScanningPromptLibrary = promptsToMigrate === undefined

    return (
        <div className={styles.innerContainer}>
            {isScanningPromptLibrary && (
                <>
                    <span className={styles.descriptionText}>
                        Scanning prompts library and custom commands{' '}
                    </span>
                    <LoadingDots />
                </>
            )}

            {!isScanningPromptLibrary && (
                <>
                    <span className={styles.descriptionText}>
                        Migrating, {migratedPrompts} out of {promptsToMigrate} commands.
                    </span>

                    <Progress.Root
                        className={styles.loader}
                        value={(migratedPrompts / promptsToMigrate) * 100}
                    >
                        <Progress.Indicator
                            className={styles.loaderIndicator}
                            style={{
                                transform: `translateX(-${
                                    100 - (migratedPrompts / promptsToMigrate) * 100
                                }%)`,
                            }}
                        />
                    </Progress.Root>
                </>
            )}
        </div>
    )
}

interface PromptMigrationFailedProps {
    errorMessage: string
}

const PromptMigrationFailed: FC<PromptMigrationFailedProps> = props => {
    const { errorMessage } = props

    return (
        <div className={styles.innerContainer}>
            <div className={styles.error}>{errorMessage}</div>

            <Button variant="outline" className="tw-mt-5">
                <SquareChevronRight size={16} />
                Try again
            </Button>
        </div>
    )
}

const PromptMigrationSuccess: FC = () => {
    return (
        <>
            <h3 className={styles.heading}>Migration completed</h3>
            <span className={styles.descriptionText}>
                All custom commands were migrated and now available in prompts library.
            </span>
        </>
    )
}
