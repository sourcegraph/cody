@file:Suppress("unused", "ConstPropertyName")
package com.sourcegraph.cody.agent.protocol_generated;

object ProtocolTypeAdapters {
  fun register(gson: com.google.gson.GsonBuilder) {
    gson.registerTypeAdapter(ContextProvider::class.java, ContextProvider.deserializer)
    gson.registerTypeAdapter(ContextItem::class.java, ContextItem.deserializer)
    gson.registerTypeAdapter(ExtensionMessage::class.java, ExtensionMessage.deserializer)
    gson.registerTypeAdapter(WebviewMessage::class.java, WebviewMessage.deserializer)
    gson.registerTypeAdapter(CustomCommandResult::class.java, CustomCommandResult.deserializer)
    gson.registerTypeAdapter(TextEdit::class.java, TextEdit.deserializer)
    gson.registerTypeAdapter(WorkspaceEditOperation::class.java, WorkspaceEditOperation.deserializer)
  }
}
