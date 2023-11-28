package com.sourcegraph.cody.ui

import com.sourcegraph.cody.Icons
import java.awt.Dimension
import javax.swing.JButton

class SendButton : JButton(Icons.Actions.Send) {

  init {
    isContentAreaFilled = false
    isBorderPainted = false
    isEnabled = false
    preferredSize = Dimension(32, 32)
    toolTipText = "Send message"
    disabledIcon = Icons.Actions.DisabledSend
  }
}
