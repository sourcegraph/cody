import type React from 'react'
import { useEffect, useState } from 'react'

import type { VSCodeWrapper } from '../utils/VSCodeApi'

import { Notice } from './Notice'

import styles from './OnboardingAutocompleteNotice.module.css'

export const OnboardingAutocompleteNotice: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({
    vscodeAPI,
}) => {
    const [showNotice, setShowNotice] = useState<boolean>(false)

    // On first render we set up a listener for messages from ChatViewProvider
    useEffect(() => {
        const cleanup = vscodeAPI.onMessage(message => {
            if (message.type === 'notice' && message.notice.key === 'onboarding-autocomplete') {
                setShowNotice(true)
            }
        })

        return () => {
            cleanup()
        }
    }, [vscodeAPI])

    if (!showNotice) {
        return undefined
    }

    return (
        <Notice
            icon={<Icon />}
            title="Congratulations! You just accepted your first Cody autocomplete."
            linkText="Next: Run a Command →"
            linkHref="command:cody.menu.commands"
            dismissKey="onboarding-autocomplete"
            className="onboarding-autocomplete"
        />
    )
}

const Icon: React.FunctionComponent = () => (
    <svg
        className={styles.icon}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={true}
    >
        <path
            d="M18.09 11.77L19.56 18.1L14 14.74L8.44 18.1L9.9 11.77L5 7.5L11.47 6.96L14 1L16.53 6.96L23 7.5L18.09 11.77Z"
            opacity="0.9"
        />
        <g className={styles.trails}>
            <path d="M1.15997 21.5505C1.35997 21.8405 1.67997 22.0005 1.99997 22.0005C2.18997 22.0005 2.37997 21.9505 2.54997 21.8405L6.65997 19.1305L6.99997 17.7605L7.30997 16.3105L1.44997 20.1605C0.988972 20.4705 0.860972 21.0905 1.15997 21.5505Z" />
            <path d="M1.15997 16.76C0.860972 16.3 0.988972 15.68 1.44997 15.38L7.31997 11.5L8.23997 12.31L7.96997 13.5L2.54997 17.05C2.37997 17.16 2.18997 17.21 1.99997 17.21C1.67997 17.21 1.35997 17.06 1.15997 16.76Z" />
            <path d="M2.54997 12.2591C2.37997 12.3691 2.18997 12.4291 1.99997 12.4291C1.67997 12.4291 1.35997 12.2691 1.15997 11.9991C0.860972 11.4991 0.988972 10.8891 1.44997 10.5891L4.17997 8.78906L5.74997 10.1491L2.54997 12.2591Z" />
        </g>
    </svg>
)
