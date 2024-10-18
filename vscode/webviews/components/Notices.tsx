import { CodyIDE, isDotCom } from '@sourcegraph/cody-shared'
import { BuildingIcon, EyeIcon, HeartIcon } from 'lucide-react'
import { type FunctionComponent, useState } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useUserAccountInfo } from '../utils/useConfig'
import { Button } from './shadcn/ui/button'

/**
 * Right now, the only notice this displays is one for Sourcegraph team members who are using
 * Sourcegraph.com to remind them that we want to be dogfooding S2.
 */
export const Notices: FunctionComponent<Record<string, never>> = () => {
    const user = useUserAccountInfo()

    /**
     * Make this dismissible per-session so it doesn't get in the way of screenshots but is a strong
     * reminder to use S2 not dotcom.
     */
    const [dismissedShowDogfoodS2Notice, setDismissedShowDogfoodS2Notice] = useState(false)

    const showDogfoodS2Notice =
        isDotCom(user.user.endpoint) &&
        user.user.organizations?.some(org => org.name === 'sourcegraph') &&
        !dismissedShowDogfoodS2Notice &&
        user.IDE !== CodyIDE.Web

    return showDogfoodS2Notice ? (
        <aside className="tw-p-4 tw-bg-red-800 tw-text-white tw-text-sm">
            <div className="tw-flex tw-gap-3 tw-mb-2">
                <EyeIcon />
                <HeartIcon />
                <BuildingIcon />
            </div>
            <p>
                Sourcegraph team members should use S2 not dotcom (except when testing dotcom-specific
                behavior) so that we dogfood our enterprise customer experience.
            </p>
            <div className="tw-mt-3 tw-flex tw-gap-3">
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => getVSCodeAPI().postMessage({ command: 'auth', authKind: 'switch' })}
                >
                    Switch to S2
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDismissedShowDogfoodS2Notice(true)}
                >
                    Dismiss
                </Button>
            </div>
        </aside>
    ) : null
}
