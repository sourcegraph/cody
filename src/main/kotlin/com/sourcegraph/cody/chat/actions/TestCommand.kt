package com.sourcegraph.cody.chat.actions

import com.sourcegraph.cody.commands.CommandId

class TestCommand : BaseCommandAction() {

  override val myCommandId = CommandId.Test
}
