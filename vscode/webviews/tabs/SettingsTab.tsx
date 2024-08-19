import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'

// Placeholder for the settings tab - Not yet implemented.
export const SettingsTab: React.FC = () => {
    return (
        <div className="tw-overflow-auto tw-flex tw-flex-col tw-gap-4 tw-px-8 tw-mt-4">
            <Button
                key="settings"
                variant="secondary"
                className="tw-w-full tw-bg-popover"
                onClick={() =>
                    getVSCodeAPI().postMessage({
                        command: 'command',
                        id: 'cody.status-bar.interacted',
                    })
                }
            >
                Cody Settings
            </Button>
        </div>
    )
}
