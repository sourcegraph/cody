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
  }

  public class ContextItemFile : ContextItem
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public RangeData Range { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
    [JsonProperty(PropertyName = "revision")]
    public string Revision { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history
    [JsonProperty(PropertyName = "size")]
    public int Size { get; set; }
    [JsonProperty(PropertyName = "isIgnored")]
    public bool IsIgnored { get; set; }
    [JsonProperty(PropertyName = "isTooLarge")]
    public bool IsTooLarge { get; set; }
    [JsonProperty(PropertyName = "isTooLargeReason")]
    public string IsTooLargeReason { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "icon")]
    public string Icon { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public string[] Metadata { get; set; }
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: file
    [JsonProperty(PropertyName = "remoteRepositoryName")]
    public string RemoteRepositoryName { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "file")]
      File,
    }
  }

  public class ContextItemRepository : ContextItem
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public RangeData Range { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
    [JsonProperty(PropertyName = "revision")]
    public string Revision { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history
    [JsonProperty(PropertyName = "size")]
    public int Size { get; set; }
    [JsonProperty(PropertyName = "isIgnored")]
    public bool IsIgnored { get; set; }
    [JsonProperty(PropertyName = "isTooLarge")]
    public bool IsTooLarge { get; set; }
    [JsonProperty(PropertyName = "isTooLargeReason")]
    public string IsTooLargeReason { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "icon")]
    public string Icon { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public string[] Metadata { get; set; }
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: repository
    [JsonProperty(PropertyName = "repoID")]
    public string RepoID { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "repository")]
      Repository,
    }
  }

  public class ContextItemTree : ContextItem
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public RangeData Range { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
    [JsonProperty(PropertyName = "revision")]
    public string Revision { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history
    [JsonProperty(PropertyName = "size")]
    public int Size { get; set; }
    [JsonProperty(PropertyName = "isIgnored")]
    public bool IsIgnored { get; set; }
    [JsonProperty(PropertyName = "isTooLarge")]
    public bool IsTooLarge { get; set; }
    [JsonProperty(PropertyName = "isTooLargeReason")]
    public string IsTooLargeReason { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "icon")]
    public string Icon { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public string[] Metadata { get; set; }
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: tree
    [JsonProperty(PropertyName = "isWorkspaceRoot")]
    public bool IsWorkspaceRoot { get; set; }
    [JsonProperty(PropertyName = "name")]
    public string Name { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "tree")]
      Tree,
    }
  }

  public class ContextItemSymbol : ContextItem
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public RangeData Range { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
    [JsonProperty(PropertyName = "revision")]
    public string Revision { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history
    [JsonProperty(PropertyName = "size")]
    public int Size { get; set; }
    [JsonProperty(PropertyName = "isIgnored")]
    public bool IsIgnored { get; set; }
    [JsonProperty(PropertyName = "isTooLarge")]
    public bool IsTooLarge { get; set; }
    [JsonProperty(PropertyName = "isTooLargeReason")]
    public string IsTooLargeReason { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "icon")]
    public string Icon { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public string[] Metadata { get; set; }
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: symbol
    [JsonProperty(PropertyName = "symbolName")]
    public string SymbolName { get; set; }
    [JsonProperty(PropertyName = "kind")]
    public SymbolKind Kind { get; set; } // Oneof: class, function, method
    [JsonProperty(PropertyName = "remoteRepositoryName")]
    public string RemoteRepositoryName { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "symbol")]
      Symbol,
    }
  }

  public class ContextItemOpenCtx : ContextItem
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public RangeData Range { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
    [JsonProperty(PropertyName = "revision")]
    public string Revision { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "source")]
    public ContextItemSource Source { get; set; } // Oneof: embeddings, user, editor, search, initial, unified, selection, terminal, uri, history
    [JsonProperty(PropertyName = "size")]
    public int Size { get; set; }
    [JsonProperty(PropertyName = "isIgnored")]
    public bool IsIgnored { get; set; }
    [JsonProperty(PropertyName = "isTooLarge")]
    public bool IsTooLarge { get; set; }
    [JsonProperty(PropertyName = "isTooLargeReason")]
    public string IsTooLargeReason { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "icon")]
    public string Icon { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public string[] Metadata { get; set; }
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: openctx
    [JsonProperty(PropertyName = "providerUri")]
    public string ProviderUri { get; set; }
    [JsonProperty(PropertyName = "mention")]
    public MentionParams Mention { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "openctx")]
      Openctx,
    }
  }
  }
}
