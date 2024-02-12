package com.sourcegraph.cody.vscode;

import com.sourcegraph.cody.agent.protocol.ChatMessage;
import java.util.List;

public class Completion {
  public final String prefix;
  public final List<ChatMessage> messages;
  public final String content;
  public final String stopReason;

  public Completion(String prefix, List<ChatMessage> messages, String content, String stopReason) {
    this.prefix = prefix;
    this.messages = messages;
    this.content = content;
    this.stopReason = stopReason;
  }

  public Completion withPrefix(String newPrefix) {
    return new Completion(newPrefix, this.messages, this.content, this.stopReason);
  }

  public Completion withMessages(List<ChatMessage> newMessages) {
    return new Completion(this.prefix, newMessages, this.content, this.stopReason);
  }

  public Completion withContent(String newContent) {
    return new Completion(this.prefix, this.messages, newContent, this.stopReason);
  }

  public Completion withStopReason(String newStopReason) {
    return new Completion(this.prefix, this.messages, this.content, newStopReason);
  }
}
