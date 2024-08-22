using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  [JsonConverter(typeof(ContextItemConverter))]
  public abstract class ContextItem
  {
      private class ContextItemConverter : JsonConverter<ContextItem>
      {
        public override ContextItem Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
          var jsonDoc = JsonDocument.ParseValue(ref reader);
          var discriminator = jsonDoc.RootElement.GetProperty("type").GetString();
          switch (discriminator)
          {
            case "file":
              return JsonSerializer.Deserialize<ContextItemFile>(jsonDoc.RootElement.GetRawText(), options);
            case "repository":
              return JsonSerializer.Deserialize<ContextItemRepository>(jsonDoc.RootElement.GetRawText(), options);
            case "tree":
              return JsonSerializer.Deserialize<ContextItemTree>(jsonDoc.RootElement.GetRawText(), options);
            case "symbol":
              return JsonSerializer.Deserialize<ContextItemSymbol>(jsonDoc.RootElement.GetRawText(), options);
            case "openctx":
              return JsonSerializer.Deserialize<ContextItemOpenCtx>(jsonDoc.RootElement.GetRawText(), options);
            default:
              throw new JsonException($"Unknown discriminator {discriminator}");
        }
        }

        public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)
        {
          JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }

  public class ContextItemFile : ContextItem
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public RangeData Range { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }

    [JsonPropertyName("revision")]
    public string Revision { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history

    [JsonPropertyName("size")]
    public int Size { get; set; }

    [JsonPropertyName("isIgnored")]
    public bool IsIgnored { get; set; }

    [JsonPropertyName("isTooLarge")]
    public bool IsTooLarge { get; set; }

    [JsonPropertyName("isTooLargeReason")]
    public string IsTooLargeReason { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("icon")]
    public string Icon { get; set; }

    [JsonPropertyName("metadata")]
    public string[] Metadata { get; set; }

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: file

    [JsonPropertyName("remoteRepositoryName")]
    public string RemoteRepositoryName { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("file")]
      File,
    }
  }

  public class ContextItemRepository : ContextItem
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public RangeData Range { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }

    [JsonPropertyName("revision")]
    public string Revision { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history

    [JsonPropertyName("size")]
    public int Size { get; set; }

    [JsonPropertyName("isIgnored")]
    public bool IsIgnored { get; set; }

    [JsonPropertyName("isTooLarge")]
    public bool IsTooLarge { get; set; }

    [JsonPropertyName("isTooLargeReason")]
    public string IsTooLargeReason { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("icon")]
    public string Icon { get; set; }

    [JsonPropertyName("metadata")]
    public string[] Metadata { get; set; }

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: repository

    [JsonPropertyName("repoID")]
    public string RepoID { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("repository")]
      Repository,
    }
  }

  public class ContextItemTree : ContextItem
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public RangeData Range { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }

    [JsonPropertyName("revision")]
    public string Revision { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history

    [JsonPropertyName("size")]
    public int Size { get; set; }

    [JsonPropertyName("isIgnored")]
    public bool IsIgnored { get; set; }

    [JsonPropertyName("isTooLarge")]
    public bool IsTooLarge { get; set; }

    [JsonPropertyName("isTooLargeReason")]
    public string IsTooLargeReason { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("icon")]
    public string Icon { get; set; }

    [JsonPropertyName("metadata")]
    public string[] Metadata { get; set; }

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: tree

    [JsonPropertyName("isWorkspaceRoot")]
    public bool IsWorkspaceRoot { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("tree")]
      Tree,
    }
  }

  public class ContextItemSymbol : ContextItem
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public RangeData Range { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }

    [JsonPropertyName("revision")]
    public string Revision { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history

    [JsonPropertyName("size")]
    public int Size { get; set; }

    [JsonPropertyName("isIgnored")]
    public bool IsIgnored { get; set; }

    [JsonPropertyName("isTooLarge")]
    public bool IsTooLarge { get; set; }

    [JsonPropertyName("isTooLargeReason")]
    public string IsTooLargeReason { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("icon")]
    public string Icon { get; set; }

    [JsonPropertyName("metadata")]
    public string[] Metadata { get; set; }

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: symbol

    [JsonPropertyName("symbolName")]
    public string SymbolName { get; set; }

    [JsonPropertyName("kind")]
    public SymbolKind Kind { get; set; } // Oneof: class, function, method

    [JsonPropertyName("remoteRepositoryName")]
    public string RemoteRepositoryName { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("symbol")]
      Symbol,
    }
  }

  public class ContextItemOpenCtx : ContextItem
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public RangeData Range { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }

    [JsonPropertyName("revision")]
    public string Revision { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history

    [JsonPropertyName("size")]
    public int Size { get; set; }

    [JsonPropertyName("isIgnored")]
    public bool IsIgnored { get; set; }

    [JsonPropertyName("isTooLarge")]
    public bool IsTooLarge { get; set; }

    [JsonPropertyName("isTooLargeReason")]
    public string IsTooLargeReason { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("icon")]
    public string Icon { get; set; }

    [JsonPropertyName("metadata")]
    public string[] Metadata { get; set; }

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: openctx

    [JsonPropertyName("providerUri")]
    public string ProviderUri { get; set; }

    [JsonPropertyName("mention")]
    public MentionParams Mention { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("openctx")]
      Openctx,
    }
  }
  }
}
