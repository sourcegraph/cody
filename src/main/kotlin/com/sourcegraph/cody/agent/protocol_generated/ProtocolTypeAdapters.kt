/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("unused", "ConstPropertyName")
package com.sourcegraph.cody.agent.protocol_generated;

object ProtocolTypeAdapters {
  fun register(gson: com.google.gson.GsonBuilder) {
    gson.registerTypeAdapter(ContextItem::class.java, ContextItem.deserializer)
    gson.registerTypeAdapter(CustomCommandResult::class.java, CustomCommandResult.deserializer)
    gson.registerTypeAdapter(TextEdit::class.java, TextEdit.deserializer)
    gson.registerTypeAdapter(WorkspaceEditOperation::class.java, WorkspaceEditOperation.deserializer)
  }
}
