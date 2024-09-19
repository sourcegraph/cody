import { useConfig } from './useConfig'

export const useExperimentalOneBox = (): boolean => {
    const config = useConfig()

    return config.config.experimentalOneBox
}
