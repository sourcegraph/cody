import { FC } from 'react'
import { CodyWebChat } from '../lib'
import styles from './App.module.css'

let ACCESS_TOKEN = localStorage.getItem('accessToken')

if (!ACCESS_TOKEN) {
    ACCESS_TOKEN = window.prompt('Enter a Sourcegraph.com access token:')
    if (!ACCESS_TOKEN) {
        throw new Error('No access token provided')
    }
    localStorage.setItem('accessToken', ACCESS_TOKEN)
}

export const App: FC = () => {
    return (
        <CodyWebChat
            accessToken={ACCESS_TOKEN}
            serverEndpoint='https://sourcegraph.com'
            className={styles.container}
        />
    )
}
