package com.sourcegraph.cody.context.ui

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.sourcegraph.common.CodyBundle

class HelpButton :
    ContextToolbarButton(
        CodyBundle.getString("context-panel.button.help"),
        AllIcons.Actions.Help,
        { BrowserUtil.open("https://sourcegraph.com/docs/cody/core-concepts/context") })
