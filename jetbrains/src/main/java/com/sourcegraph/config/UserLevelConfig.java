package com.sourcegraph.config;

import com.sourcegraph.cody.autocomplete.AutocompleteProviderType;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;
import java.util.Properties;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class UserLevelConfig {
  /** Overrides the provider used for generating autocomplete suggestions. */
  @Nullable
  public static AutocompleteProviderType getAutocompleteProviderType() {
    Properties properties = readProperties();
    String currentKey = "cody.autocomplete.advanced.provider";
    @Deprecated(since = "3.0.4")
    String oldKey = "cody.completions.advanced.provider";
    return Optional.ofNullable(properties.getProperty(currentKey, null))
        .or(
            () ->
                Optional.ofNullable(
                    properties.getProperty(oldKey, null))) // fallback to the old key
        .flatMap(AutocompleteProviderType::optionalValueOf)
        .orElse(null);
  }

  @Nullable
  public static String getDefaultBranchName() {
    Properties properties = readProperties();
    return properties.getProperty("defaultBranch", null);
  }

  @Nullable
  public static String getRemoteUrlReplacements() {
    Properties properties = readProperties();
    return properties.getProperty("remoteUrlReplacements", null);
  }

  @Nullable
  public static String getProxy() {
    return readProperties().getProperty("cody.proxy", null);
  }

  @NotNull
  public static String getSourcegraphUrl() {
    Properties properties = readProperties();
    return properties.getProperty("url", "");
  }

  // readProps returns the first properties file it's able to parse from the following paths:
  //   $HOME/.sourcegraph-jetbrains.properties
  //   $HOME/sourcegraph-jetbrains.properties
  @NotNull
  private static Properties readProperties() {
    Path[] candidatePaths = {
      Paths.get(System.getProperty("user.home"), ".sourcegraph-jetbrains.properties"),
      Paths.get(System.getProperty("user.home"), "sourcegraph-jetbrains.properties"),
    };

    for (Path path : candidatePaths) {
      try {
        return readPropertiesFile(path.toFile());
      } catch (IOException e) {
        // no-op
      }
    }
    // No files found/readable
    return new Properties();
  }

  @NotNull
  private static Properties readPropertiesFile(File file) throws IOException {
    Properties properties = new Properties();

    try (InputStream input = new FileInputStream(file)) {
      properties.load(input);
    }

    return properties;
  }
}
