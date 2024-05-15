package com.sourcegraph.cody.commands

import java.awt.event.KeyEvent

enum class CommandId(val id: String, val displayName: String, val mnemonic: Int) {
  Explain("cody.command.Explain", "Explain Code", KeyEvent.VK_E),
  Smell("cody.command.Smell", "Smell Code", KeyEvent.VK_S),
  Test("cody.command.Test", "Generate Test", KeyEvent.VK_T)
}
