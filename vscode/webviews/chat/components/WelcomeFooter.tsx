import styles from './WelcomeFooter.module.css'

const ADD_CONTEXT_MSG = "Type @ to add context to your chat"
const START_CHAT_MSG = "Start a new chat using ⌥ / or the New Chat button"
const EDITOR_CONTEXT_MSG = "To add code context from an editor, right click and use Add to Cody Chat"

export default function WelcomeFooter() {
    return (
        <div id="welcome-footer" className={styles.welcomeFooter}>
            <div className={styles.tips}>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <div className="tip">{ADD_CONTEXT_MSG}</div>
                </div>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <div className="tip">{START_CHAT_MSG}</div>
                </div>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <div className="tip">{EDITOR_CONTEXT_MSG}</div>
                </div>
            </div>
            <div className={styles.separator} />
            <div className={styles.links}>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <div className="tip">Documentation</div>
                </div>
                <div className={styles.item}>
                    <div className="icon">@</div>
                    <div className="tip">Help and Support</div>
                </div>
            </div>
        </div>
    )
}
