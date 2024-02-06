package com.sourcegraph.cody.commands

enum class CommandId(val displayName: String, val mnemonic: Char) {
  Explain("Explain Code", 'E'),
  Smell("Smell Code", 'S'),
  Test("Generate Test", 'T')
}
