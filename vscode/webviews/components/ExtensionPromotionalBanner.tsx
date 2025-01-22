import type { CodyIDE } from '@sourcegraph/cody-shared'
import { useState } from 'react'
import { SourcegraphLogo } from '../icons/SourcegraphLogo'
import styles from './ExtensionPromotionalBanner.module.css'

const BANNER_DISMISSED_KEY = 'cody-extension-banner-dismissed'

export const ExtensionPromotionalBanner: React.FC<{ IDE: CodyIDE }> = ({ IDE }) => {
    const [isVisible, setIsVisible] = useState(() => {
        // Initialize state from localStorage
        return localStorage.getItem(BANNER_DISMISSED_KEY) !== 'true'
    })
    const [isClosing, setIsClosing] = useState(false)

    const handleDismiss = () => {
        setIsClosing(true)
        // Wait for animation to complete before hiding
        setTimeout(() => {
            setIsVisible(false)
            // Save dismissed state to localStorage
            localStorage.setItem(BANNER_DISMISSED_KEY, 'true')
        }, 300)
    }

    if (!isVisible) {
        return null
    }

    return (
        <div
            className={`${styles.banner} ${isClosing ? styles.slideOut : styles.slideIn} tw-flex tw-items-center tw-w-full tw-max-w-[640px] tw-mb-16 tw-mt-4 tw-shadow tw-relative`}
        >
            <div className="tw-flex tw-flex-row tw-gap-6 tw-items-start tw-py-2">
                <SourcegraphLogo className="tw-w-10 tw-h-10 tw-m-2" />
                    <div className="tw-flex tw-flex-col tw-max-w-[400px] tw-gap-1">
                        <h3>Get Sourcegraph for your favorite editor</h3>
                        <p className="tw-leading-tight">
                            Download the extension to get the power of Sourcegraph right where you code
                        </p>
                </div>{' '}
            </div>
            <div className="tw-flex tw-gap-12 tw-mx-4">
                <div className="tw-flex tw-gap-12">
                    <img alt="VS Code" src="https://storage.googleapis.com/sourcegraph-assets/ideIcons/ideIconVsCode.svg" width="24" height="24" />
                    <img alt="All JetBrains IDEs" src="https://storage.googleapis.com/sourcegraph-assets/ideIcons/ideIconJetBrains.svg" width="24" height="24" />
                </div>
                <a
                    href="https://sourcegraph.com/docs/cody"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.downloadButton}
                >
                    Download
                </a>
                <button
                    className="tw-text-muted-foreground hover:tw-text-foreground"
                    onClick={handleDismiss}
                    aria-label="Close banner"
                    type="button"
                >
                    ✕
                </button>
            </div>{' '}
        </div>
    )
}
