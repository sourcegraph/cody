import { cn } from '../../components/shadcn/utils'
import styles from './InfoMessage.module.css'
interface InfoMessageProps {
    children: React.ReactNode
    className?: string
}
export const InfoMessage: React.FunctionComponent<InfoMessageProps> = ({ children, className }) => {
    return <div className={cn(styles.infoMessage, 'tw-p-4 tw-rounded-sm', className)}>{children}</div>
}
