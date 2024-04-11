package com.sourcegraph.cody.commands

import java.awt.event.KeyEvent

enum class CommandId(val displayName: String, val mnemonic: Int) {
  Explain("Explain Code", KeyEvent.VK_E),
  Smell("Smell Code", KeyEvent.VK_S),
  Test("Generate Test", KeyEvent.VK_T)
}
