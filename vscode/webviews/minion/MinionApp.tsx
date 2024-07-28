import { useCallback, useEffect, useState } from 'react'
import type {
    BlockStatus,
    Event as EventItem,
    MinionTranscriptItem,
    PlanStatus,
    PlanStepsStatus,
    Step,
} from '../../src/minion/action'

import './MinionApp.css'
import {
    type ClientStateForWebview,
    type GenericVSCodeWrapper,
    type RangeData,
    type SerializedPromptEditorValue,
    markdownCodeBlockLanguageIDForFilename,
} from '@sourcegraph/cody-shared'
import { ClientStateContextProvider, PromptEditor } from '@sourcegraph/prompt-editor'
import type { URI } from 'vscode-uri'
import { FileLink } from '../components/FileLink'
import { MarkdownFromCody } from '../components/MarkdownFromCody'
import { updateDisplayPathEnvInfoForWebview } from '../utils/displayPathEnvInfo'
import type { MinionExtensionMessage, MinionWebviewMessage } from './webview_protocol'

const StopSpinner = () => (
    <span className="stop-spinner">
        <i className="codicon codicon-loading spinner" />
        <i className="codicon codicon-debug-stop stop" />
    </span>
)

const UserInput: React.FunctionComponent<{
    mode: 'start' | 'interrupt'
    onSubmit?: (value: string) => void
}> = ({ mode, onSubmit }) => {
    const [description, setDescription] = useState('')

    const onEnter = useCallback(
        (event: KeyboardEvent | null): void => {
            if (event && !event.shiftKey && !event.isComposing && description.trim().length > 0) {
                event.preventDefault()
                if (onSubmit) {
                    onSubmit(description)
                }
                setDescription('')
            }
        },
        [description, onSubmit]
    )

    const onEditorChange = useCallback((value: SerializedPromptEditorValue): void => {
        setDescription(value.text)
    }, [])

    return (
        <div className="input-group">
            <PromptEditor
                onChange={onEditorChange}
                onEnterKey={onEnter}
                placeholder={mode === 'start' ? "Describe what you'd like to do" : 'Make a comment'}
            />
            <span className="input-icon">
                <i className="codicon codicon-comment" />
            </span>
        </div>
    )
}

const PlanStepControls: React.FunctionComponent<{
    status: PlanStatus
    setStatus(status: 'todo' | 'done' | 'running' | 'run-disabled'): void
}> = ({ status, setStatus }) => {
    const baseStatusIcon = ['todo', 'run-disabled'].includes(status) ? 'circle-large' : 'pass-filled'
    const hoverStatusIcon = ['todo', 'run-disabled'].includes(status) ? 'pass' : 'pass-filled'
    const [statusHover, setStatusHover] = useState(false)
    const setStatusHoverTrue = useCallback(() => setStatusHover(true), [])
    const setStatusHoverFalse = useCallback(() => setStatusHover(false), [])
    const setStatusDone = useCallback(() => setStatus('done'), [setStatus])
    const setStatusTodo = useCallback(() => setStatus('todo'), [setStatus])

    const statusIcon = statusHover ? hoverStatusIcon : baseStatusIcon
    const controls = []

    switch (status) {
        case 'todo':
        case 'run-disabled':
            controls.push(
                <button
                    key={1}
                    type="button"
                    className="event-button"
                    onMouseEnter={setStatusHoverTrue}
                    onMouseLeave={setStatusHoverFalse}
                    onClick={setStatusDone}
                >
                    <i className={`codicon codicon-${statusIcon}`} />
                </button>
            )
            break
        case 'done':
            controls.push(
                <button
                    key={1}
                    type="button"
                    className="event-button"
                    onMouseEnter={setStatusHoverTrue}
                    onMouseLeave={setStatusHoverFalse}
                    onClick={setStatusTodo}
                >
                    <i className={`codicon codicon-${statusIcon}`} />
                </button>
            )
            break
    }

    switch (status) {
        case 'todo':
            controls.push(
                <button
                    key={2}
                    type="button"
                    className="event-button"
                    onClick={() => setStatus('running')}
                >
                    <i className="codicon codicon-play" />
                </button>
            )
            break
        case 'running':
            controls.push(
                <button key={2} type="button" className="event-button" onClick={() => setStatus('todo')}>
                    <StopSpinner />
                </button>
            )
            break
        case 'run-disabled':
            controls.push(
                <button key={2} type="button" className="event-button event-button-disabled">
                    <i className="codicon codicon-play" title="Run disabled" />
                </button>
            )
            break
    }

    return (
        <div className={`step-controls ${controls.length > 1 && 'step-controls-multi'}`}>{controls}</div>
    )
}

const PlanBlock: React.FunctionComponent<{
    title: string
    status: 'todo' | 'doing' | 'done'
    steps: Step[]
    stepStatus: PlanStepsStatus
    updateStep: (stepid: string, status: PlanStatus) => void
}> = ({ status, title, steps, stepStatus, updateStep }) => {
    return (
        <EventItem level={0} codicon={'checklist'} title={title}>
            <div className="steps-container">
                {steps.map(step => (
                    <div key={step.title} className="step">
                        <div className="step-header">
                            <PlanStepControls
                                status={stepStatus[step.stepId]?.status ?? 'run-disabled'}
                                setStatus={status => {
                                    updateStep(step.stepId, status)
                                }}
                            />
                            <span className="step-title">{step.title}</span>
                        </div>
                        <div className="step-description">{step.description}</div>
                    </div>
                ))}
            </div>
        </EventItem>
    )
}

const EventItem: React.FunctionComponent<{
    level: number
    codicon: string
    title: string
    children?: React.ReactNode
}> = ({ level, codicon, title, children }) => {
    return (
        <div className={`event event-l${level}`}>
            <div className="event-title">
                <i className={`codicon codicon-${codicon}`} />
                <span className="event-title-name">{title}</span>
            </div>
            <div className="event-body">{children}</div>
        </div>
    )
}

const BlockItem: React.FunctionComponent<{
    title: string
    state: BlockStatus
    onReplay: () => void
    onCancelCurrent: () => void
}> = ({ title, state, onReplay, onCancelCurrent }) => {
    return (
        <div className="node-block">
            <span>
                {state === 'doing' ? (
                    <button
                        type="button"
                        className="node-header-button"
                        onClick={() => onCancelCurrent()}
                    >
                        <StopSpinner />
                    </button>
                ) : state === 'cancelled' ? (
                    <button type="button" className="node-header-button" onClick={() => onReplay()}>
                        <i className="codicon codicon-play" />
                    </button>
                ) : (
                    <button type="button" className="node-header-button" onClick={() => onReplay()}>
                        <i className="codicon codicon-debug-restart" />
                    </button>
                )}
            </span>
            <span className="node-title">{`${capitalize(title)}${
                state === 'cancelled' ? ' (stopped)' : ''
            }`}</span>
        </div>
    )
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

interface EventInfo {
    codicon: string
    title: string
}

function displayInfoForEvent(event: EventItem): EventInfo {
    const hardcoded: Partial<{ [key in EventItem['type']]: Partial<EventInfo> }> = {
        describe: { codicon: 'lightbulb' },
        restate: { codicon: 'comment-discussion' },
        contextualize: { codicon: 'search' },
        reproduce: { codicon: 'beaker' },
        plan: { codicon: 'checklist' },
        search: { codicon: 'search' },
        open: { codicon: 'file' },
        scroll: { codicon: 'eye' },
        edit: { codicon: 'edit' },
        bash: { codicon: 'terminal' },
        human: { codicon: 'robot', title: 'Observed human' },
    }
    const info = hardcoded[event.type] || {}
    switch (event.type) {
        case 'open': {
            info.title = `Open ${event.file}`
            break
        }
    }
    return {
        codicon: info?.codicon ?? 'circle',
        title: info?.title ?? capitalize(event.type).replace('-', ' '),
    }
}

function uriRangeString(uri: URI, range: RangeData): string {
    return `${uri.toString()}${range.start.line + 1}:${range.start.character + 1}-${
        range.end.line + 1
    }:${range.end.character + 1}`
}

function renderEvent(
    event: EventItem,
    key: string,
    planStepStatus: { [blockid: string]: PlanStepsStatus },
    actions: {
        updateStep: (blockid: string, stepid: string, status: PlanStatus) => void
    }
): React.ReactNode {
    if (event.type === 'plan') {
        return (
            <PlanBlock
                title={'Plan'}
                steps={event.steps}
                status={'todo'}
                stepStatus={planStepStatus[event.blockid] ?? {}}
                updateStep={(stepid, status) => {
                    actions.updateStep(event.blockid, stepid, status)
                }}
            />
        )
    }
    const { codicon, title } = displayInfoForEvent(event)
    switch (event.type) {
        case 'describe': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <div className="event-text">{event.description}</div>
                </EventItem>
            )
        }
        case 'restate': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <div className="event-text">{event.output}</div>
                </EventItem>
            )
        }
        case 'contextualize': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <div className="contextualize-explanation">Found some relevant context:</div>
                    {event.output.map(annotatedContext => {
                        const langID = markdownCodeBlockLanguageIDForFilename(
                            annotatedContext.source.uri
                        )
                        const md = '```' + langID + '\n' + annotatedContext.text + '\n```'

                        return (
                            <div
                                className="event-code-container"
                                key={uriRangeString(
                                    annotatedContext.source.uri,
                                    annotatedContext.source.range
                                )}
                            >
                                <div className="event-code-filename">
                                    <FileLink
                                        linkClassName="event-code-filename-link"
                                        uri={annotatedContext.source.uri}
                                        range={annotatedContext.source.range}
                                    />
                                </div>
                                <MarkdownFromCody className="event-code-snippet">{md}</MarkdownFromCody>
                                <div className="event-text">{annotatedContext.comment}</div>
                            </div>
                        )
                    })}
                </EventItem>
            )
        }
        case 'reproduce': {
            return <EventItem level={event.level} codicon={codicon} title={title} />
        }
        case 'search': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <div>Query: {event.query}</div>
                    <ol>
                        {event.results.map(result => (
                            <li key={result}>{result}</li>
                        ))}
                    </ol>
                </EventItem>
            )
        }
        case 'open': {
            return <EventItem level={event.level} codicon={codicon} title={title} />
        }
        case 'scroll': {
            return (
                <EventItem level={event.level} codicon={codicon} title={`Scroll ${event.direction}`} />
            )
        }
        case 'edit': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <textarea className="event-input" />
                </EventItem>
            )
        }
        case 'bash': {
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    <textarea className="event-input" />
                </EventItem>
            )
        }
        case 'human': {
            let child: React.ReactNode | undefined
            switch (event.actionType) {
                case 'edit':
                    child = (
                        <div className="human-action">
                            <i className="codicon codicon-edit" />
                            &nbsp;
                            <span>{event.description}</span>
                        </div>
                    )
                    break
                case 'view':
                    child = (
                        <div className="human-action">
                            <i className="codicon codicon-eye" />
                            &nbsp;
                            <span>{event.description}</span>
                        </div>
                    )
                    break
            }
            return (
                <EventItem level={event.level} codicon={codicon} title={title}>
                    {child}
                </EventItem>
            )
        }
        default: {
            return <EventItem level={(event as any).level} codicon={codicon} title={title} />
        }
    }
}

export const MinionApp: React.FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<MinionWebviewMessage, MinionExtensionMessage>
}> = ({ vscodeAPI }) => {
    const [transcript, setTranscript] = useState<MinionTranscriptItem[]>([])
    const [sessionIds, setSessionIds] = useState<string[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>()
    const [planStepsStatus, setPlanStepsStatus] = useState<{ [blockid: string]: PlanStepsStatus }>({})
    const [clientState] = useState<ClientStateForWebview>({
        initialContext: [],
    })

    useEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'config':
                    updateDisplayPathEnvInfoForWebview(message.workspaceFolderUris)
                    break
                case 'update-session-ids':
                    setCurrentSessionId(message.currentSessionId)
                    setSessionIds(message.sessionIds)
                    break
                case 'update-transcript':
                    setTranscript(message.transcript)
                    break
                case 'update-plan-step-status': {
                    const { blockid, stepStatus } = message
                    setPlanStepsStatus({ ...planStepsStatus, [blockid]: stepStatus })
                    break
                }
            }
        })

        vscodeAPI.postMessage({ type: 'ready' })
    }, [vscodeAPI, planStepsStatus])

    const clearHistory = useCallback(() => {
        vscodeAPI.postMessage({ type: 'clear-history' })
    }, [vscodeAPI])

    const replayFromBlock = useCallback(
        (transcriptIndex: number) => {
            if (transcriptIndex >= transcript.length || transcript[transcriptIndex].type !== 'block') {
                throw new Error(
                    'Item at index was not block: ' + JSON.stringify(transcript[transcriptIndex])
                )
            }
            vscodeAPI.postMessage({
                type: 'replay-from-index',
                index: transcriptIndex,
            })
        },
        [vscodeAPI, transcript]
    )

    const cancelCurrentBlock = useCallback(() => {
        vscodeAPI.postMessage({ type: 'cancel-current-block' })
    }, [vscodeAPI])

    const updatePlanStep = useCallback(
        (blockid: string, stepid: string, status: PlanStatus) => {
            vscodeAPI.postMessage({
                type: 'update-plan-step',
                blockid,
                stepid,
                status,
            })
        },
        [vscodeAPI]
    )

    const onSelectSession = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const sessionId = event.target.value
            if (sessionId === undefined || sessionId.length === 0) {
                return
            }
            setCurrentSessionId(sessionId)
            vscodeAPI.postMessage({ type: 'set-session', id: sessionId })
        },
        [vscodeAPI]
    )

    return (
        <ClientStateContextProvider value={clientState}>
            <div className="app">
                <div className="controls">
                    <button type="button">
                        <i className="codicon codicon-add" />
                    </button>

                    <button type="button" onClick={clearHistory}>
                        <i className="codicon codicon-clear-all" />
                    </button>

                    <select
                        className="controls-session-selector"
                        onChange={onSelectSession}
                        value={currentSessionId}
                    >
                        {sessionIds.map(id => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="transcript">
                    {transcript.map((item, i) => (
                        <div key={`${item.type}-${i}`}>
                            {item.type === 'event' ? (
                                renderEvent(item.event, `${i}`, planStepsStatus, {
                                    updateStep: updatePlanStep,
                                })
                            ) : (
                                <BlockItem
                                    state={item.status}
                                    title={item.block.nodeid}
                                    onReplay={() => replayFromBlock(i)}
                                    onCancelCurrent={() => cancelCurrentBlock()}
                                />
                            )}
                        </div>
                    ))}
                </div>
                {transcript.length === 0 && (
                    <div className="user-input">
                        <UserInput
                            mode={'start'}
                            onSubmit={text => {
                                vscodeAPI.postMessage({ type: 'start', description: text })
                            }}
                        />
                    </div>
                )}
            </div>
        </ClientStateContextProvider>
    )
}
