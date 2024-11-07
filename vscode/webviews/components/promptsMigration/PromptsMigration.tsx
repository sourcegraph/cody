import * as Progress from '@radix-ui/react-progress'
import { clsx } from 'clsx'
import {
    ArrowRight,
    BookText,
    LucideExternalLink,
    PencilRuler,
    SquareChevronRight,
    X,
} from 'lucide-react'
import type { FC } from 'react'

import { LoadingDots } from '../../chat/components/LoadingDots'
import { useLocalStorage } from '../../components/hooks'
import { Button } from '../../components/shadcn/ui/button'

import type { PromptsMigrationStatus } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useCallback, useMemo } from 'react'
import styles from './PromptsMigration.module.css'

interface PromptMigrationWidgetProps {
    dismissible?: boolean
    className?: string
}

export const PromptMigrationWidget: FC<PromptMigrationWidgetProps> = props => {
    const { dismissible, className } = props
    const api = useExtensionAPI()
    const { value } = useObservable(
        useMemo(() => api.promptsMigrationStatus(), [api.promptsMigrationStatus])
    )

    const handleMigrationStart = useCallback(() => {
        void api.startPromptsMigration().subscribe(() => {})
    }, [api.startPromptsMigration])

    if (!value || value.type === 'migration_skip') {
        return null
    }

    return (
        <PromptsMigration
            status={value}
            dismissible={value.type === 'no_migration_needed' || dismissible}
            className={className}
            onMigrationStart={handleMigrationStart}
        />
    )
}

interface PromptsMigrationProps {
    status: PromptsMigrationStatus
    dismissible?: boolean
    className?: string
    onMigrationStart?: () => void
}

export const PromptsMigration: FC<PromptsMigrationProps> = props => {
    const { status, dismissible, className, onMigrationStart } = props
    const [wasDismissed, setDismissed] = useLocalStorage('cody.prompt-migration-banner')

    if (dismissible && wasDismissed) {
        return null
    }

    return (
        <div className={clsx(className, styles.root)}>
            <header className={clsx('tw-text-muted-foreground', styles.iconsHeader)}>
                <PencilRuler size={18} />
                <ArrowRight size={18} />
                <BookText size={18} />

                {dismissible && (
                    <Button
                        variant="ghost"
                        className={clsx('tw-text-muted-foreground', styles.close)}
                        onClick={() => setDismissed(true)}
                    >
                        <X size={16} />
                    </Button>
                )}
            </header>

            {status.type === 'initial_migration' && (
                <PromptsMigrationInitial
                    isMigrationAvailable={true}
                    onMigrationStart={onMigrationStart}
                />
            )}

            {status.type === 'no_migration_needed' && (
                <PromptsMigrationInitial isMigrationAvailable={false} />
            )}

            {status.type === 'migrating' && (
                <PromptsMigrationLoading
                    migratedPrompts={status.commandsMigrated}
                    promptsToMigrate={status.allCommandsToMigrate}
                />
            )}

            {status.type === 'migration_failed' && (
                <PromptMigrationFailed errorMessage={status.errorMessage} />
            )}
            {status.type === 'migration_success' && <PromptMigrationSuccess />}
        </div>
    )
}

interface PromptsMigrationInitial {
    isMigrationAvailable: boolean
    onMigrationStart?: () => void
}

const PromptsMigrationInitial: FC<PromptsMigrationInitial> = props => {
    const { isMigrationAvailable, onMigrationStart } = props

    return (
        <>
            <h3 className={styles.heading}>Commands are now Prompts</h3>

            <span className={styles.descriptionText}>
                Prompts are assuming the features of commands, including custom commands.
            </span>

            <div className={styles.actions}>
                {isMigrationAvailable && (
                    <Button variant="default" className={styles.action} onClick={onMigrationStart}>
                        <SquareChevronRight size={16} />
                        Migrate commands
                    </Button>
                )}

                <Button variant="outline" className={styles.action} asChild={true}>
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href="https://sourcegraph.com/docs/cody/capabilities/commands#prompt-library"
                    >
                        Explore docs
                        <LucideExternalLink size={16} />
                    </a>
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
