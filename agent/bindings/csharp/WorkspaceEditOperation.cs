using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  [JsonConverter(typeof(WorkspaceEditOperationConverter))]
  public abstract class WorkspaceEditOperation
  {
      private class WorkspaceEditOperationConverter : JsonConverter<WorkspaceEditOperation>
      {
        public override WorkspaceEditOperation Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
          var jsonDoc = JsonDocument.ParseValue(ref reader);
          var discriminator = jsonDoc.RootElement.GetProperty("type").GetString();
          switch (discriminator)
          {
            case "create-file":
              return JsonSerializer.Deserialize<CreateFileOperation>(jsonDoc.RootElement.GetRawText(), options);
            case "rename-file":
              return JsonSerializer.Deserialize<RenameFileOperation>(jsonDoc.RootElement.GetRawText(), options);
            case "delete-file":
              return JsonSerializer.Deserialize<DeleteFileOperation>(jsonDoc.RootElement.GetRawText(), options);
            case "edit-file":
              return JsonSerializer.Deserialize<EditFileOperation>(jsonDoc.RootElement.GetRawText(), options);
            default:
              throw new JsonException($"Unknown discriminator {discriminator}");
            }
        }
        public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)
        {
          JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
  }

  public class CreateFileOperation : WorkspaceEditOperation
  {
    [JsonProperty(PropertyName = "type")]
    public string Type { get; set; } // Oneof: create-file
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "options")]
    public WriteFileOptions Options { get; set; }
    [JsonProperty(PropertyName = "textContents")]
    public string TextContents { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }
  }

  public class RenameFileOperation : WorkspaceEditOperation
  {
    [JsonProperty(PropertyName = "type")]
    public string Type { get; set; } // Oneof: rename-file
    [JsonProperty(PropertyName = "oldUri")]
    public string OldUri { get; set; }
    [JsonProperty(PropertyName = "newUri")]
    public string NewUri { get; set; }
    [JsonProperty(PropertyName = "options")]
    public WriteFileOptions Options { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }
  }

  public class DeleteFileOperation : WorkspaceEditOperation
  {
    [JsonProperty(PropertyName = "type")]
    public string Type { get; set; } // Oneof: delete-file
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "deleteOptions")]
    public DeleteOptionsParams DeleteOptions { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }
  }

  public class EditFileOperation : WorkspaceEditOperation
  {
    [JsonProperty(PropertyName = "type")]
    public string Type { get; set; } // Oneof: edit-file
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "edits")]
    public TextEdit[] Edits { get; set; }
  }
  }
}
