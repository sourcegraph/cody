import styles from './WelcomeFooter.module.css'

const ADD_CONTEXT_MSG = "Type @ to add context to your chat"
const START_CHAT_MSG = "Start a new chat using ⌥ / or the New Chat button"
const EDITOR_CONTEXT_MSG = "To add code context from an editor, right click and use Add to Cody Chat"
const CODY_DOCS_URL = "https://sourcegraph.com/docs/cody"
const HELP_URL = "https://community.sourcegraph.com/"
// get the icons set up first, then set up an iterable array.

const { welcomeFooter, tips, item, links, separator } = styles

export default function WelcomeFooter() {
    return (
        <div id="welcome-footer" className={welcomeFooter}>
            <div className={tips}>
                <div className={item}>
                    <div className="icon">@</div>
                    <div className="tip">{ADD_CONTEXT_MSG}</div>
                </div>
                <div className={item}>
                    <div className="icon">@</div>
                    <div className="tip">{START_CHAT_MSG}</div>
                </div>
                <div className={item}>
                    <div className="icon">@</div>
                    <div className="tip">{EDITOR_CONTEXT_MSG}</div>
                </div>
            </div>

            <div className={separator} />

            <div className={links}>
                <div className={item}>
                    <div className="icon">@</div>
                    <a
                        href={CODY_DOCS_URL}
                        className="tip"
                        rel="noreferrer"
                        target="_blank"
                    >
                        Documentation
                    </a>
                </div>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <a
                        href={HELP_URL}
                        className="tip"
                        rel="noreferrer"
                        target="_blank"
                    >
                        Help and Support
                    </a>
                </div>
            </div>
        </div >
    )
}
