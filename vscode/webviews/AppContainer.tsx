import { useEffect } from 'react'
import type { VSCodeWrapper } from './utils/VSCodeApi'

export const AgentAppContainer: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({
    vscodeAPI,
}) => {
    useEffect(() => {
        vscodeAPI.postMessage({ type: 'ready' } as any)
        vscodeAPI.postMessage({ type: 'foobar' } as any)
    }, [vscodeAPI])
    return (
        <div className="transcript">
            <div className="l0-action">
                <div className="action-title">Restate</div>
            </div>

            <div className="l0-action">
                <div className="action-title">Contextualize</div>
            </div>

            <div className="l0-action">
                <div className="action-title">Reproduce</div>
            </div>

            <div className="l0-action">
                <div className="action-title">Plan</div>
                <div className="action-body">
                    <ol>
                        <li>Step 1</li>
                        <li>Step 2</li>
                        <li>Step 3</li>
                    </ol>
                </div>
            </div>

            <div className="l1-action">
                <div className="action-title">Do step 1</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Search</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Open $file</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Scroll down</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Edit</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Run bash command</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Edit</div>
            </div>

            <div className="l2-action">
                <div className="action-title">Run bash command</div>
            </div>
        </div>
    )
}
