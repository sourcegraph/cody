import { createContext, useContext } from 'react'
import { View } from '../tabs'

interface TabViewContextData {
    view: View
    setView: (view: View) => void
}

export const TabViewContext = createContext<TabViewContextData>({
    view: View.Chat,
    setView: () => {},
})

export function useTabView(): TabViewContextData {
    return useContext(TabViewContext)
}
