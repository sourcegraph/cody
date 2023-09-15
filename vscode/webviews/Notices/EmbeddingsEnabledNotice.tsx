import { Notice } from './Notice'

import styles from './EmbeddingsEnabledNotice.module.css'

// A green shooting star. Hooray.
const Icon: React.FunctionComponent = () => (
    <svg
        className={styles.icon}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M18.09 11.77L19.56 18.1L14 14.74L8.44 18.1L9.9 11.77L5 7.5L11.47 6.96L14 1L16.53 6.96L23 7.5L18.09 11.77Z"
            fill="#73C991"
        />
        <path
            opacity="0.5"
            d="M1.15985 21.55C1.35985 21.84 1.67985 22 1.99985 22C2.18985 22 2.37985 21.95 2.54985 21.84L6.65985 19.13L6.99985 17.76L7.30985 16.31L1.44985 20.16C0.98885 20.47 0.86085 21.09 1.15985 21.55Z"
            fill="#73C991"
        />
        <path
            opacity="0.5"
            d="M1.15985 16.76C0.86085 16.3 0.98885 15.68 1.44985 15.38L7.31985 11.5L8.23985 12.31L7.96985 13.5L2.54985 17.05C2.37985 17.16 2.18985 17.21 1.99985 17.21C1.67985 17.21 1.35985 17.06 1.15985 16.76Z"
            fill="#73C991"
        />
        <path
            opacity="0.5"
            d="M2.54985 12.2591C2.37985 12.3691 2.18985 12.4291 1.99985 12.4291C1.67985 12.4291 1.35985 12.2691 1.15985 11.9991C0.86085 11.4991 0.98885 10.8891 1.44985 10.5891L4.17985 8.78906L5.74985 10.1491L2.54985 12.2591Z"
            fill="#73C991"
        />
    </svg>
)

// TODO(dpc): This needs state to hide the notice when it is dismissed.
export const EmbeddingsEnabledNotice: React.FunctionComponent<{}> = () => {
    const title = <div className={styles.title}>Embeddings Enabled</div>
    return (
        <Notice
            icon={<Icon />}
            title={title}
            text="This repository now has embeddings context enabled using Cody App."
            onDismiss={() => {}}
        />
    )
}
