import type { CodyIDE } from '@sourcegraph/cody-shared'
import { VersionUpdatedNotice } from './VersionUpdatedNotice'

interface NoticesProps {
    probablyNewInstall: boolean | undefined
    IDE?: CodyIDE
    version?: string
}

export const Notices: React.FunctionComponent<NoticesProps> = ({ probablyNewInstall, IDE, version }) =>
    probablyNewInstall !== undefined &&
    IDE !== undefined &&
    version !== undefined && (
        <div className="tw-w-full tw-z-1 tw-flex tw-flex-col tw-gap-8 tw-pt-8 tw-px-[15px] empty:tw-hidden">
            <VersionUpdatedNotice probablyNewInstall={probablyNewInstall} IDE={IDE} version={version} />
        </div>
    )
