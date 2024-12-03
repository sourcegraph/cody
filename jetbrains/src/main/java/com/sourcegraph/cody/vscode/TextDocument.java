package com.sourcegraph.cody.vscode;

import com.sourcegraph.cody.agent.protocol_generated.Position;
import java.net.URI;
import java.util.Optional;
import org.jetbrains.annotations.NotNull;

public interface TextDocument {
  URI uri();

  @NotNull
  String fileName();

  String getText();

  Position positionAt(int offset);

  @NotNull
  Optional<String> getLanguageId();
}
