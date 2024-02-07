package com.sourcegraph.cody.commands

import com.sourcegraph.cody.agent.protocol.Source

enum class CommandId(val displayName: String, val source: Source, val mnemonic: Char) {
  Explain("Explain Code", Source.EXPLAIN, 'E'),
  Smell("Smell Code", Source.SMELL, 'S'),
  Test("Generate Test", Source.TEST, 'T')
}
