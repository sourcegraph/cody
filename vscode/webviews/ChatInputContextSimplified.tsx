import { ChatContextStatus } from '@sourcegraph/cody-shared'

import { InstallCodyAppPopup } from './Popups/OnboardingExperimentPopups'

import popupStyles from './Popups/Popup.module.css'

export interface ChatInputContextSimplifiedProps {
    contextStatus: ChatContextStatus
    isAppInstalled: boolean
}

// This is a fork of ChatInputContext with extra UI for simplified "App-less"
// Onboarding. Note, it is just the onboarding that's simplified: This component
// has *more* UI to guide users through the app setup steps they skipped during
// the simplified onboarding flow.
export const ChatInputContextSimplified: React.FC<ChatInputContextSimplifiedProps> = ({ isAppInstalled }) => (
    <div className={popupStyles.popupHost}>
        Hey, {isAppInstalled ? 'app is installed, hooray' : 'app is not installed'}
        <InstallCodyAppPopup />
    </div>
)
