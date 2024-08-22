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

  public class CreateFileOperation : WorkspaceEditOperation
  {

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: create-file

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("options")]
    public WriteFileOptions Options { get; set; }

    [JsonPropertyName("textContents")]
    public string TextContents { get; set; }

    [JsonPropertyName("metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("create-file")]
      Create-file,
    }
  }

  public class RenameFileOperation : WorkspaceEditOperation
  {

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: rename-file

    [JsonPropertyName("oldUri")]
    public string OldUri { get; set; }

    [JsonPropertyName("newUri")]
    public string NewUri { get; set; }

    [JsonPropertyName("options")]
    public WriteFileOptions Options { get; set; }

    [JsonPropertyName("metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("rename-file")]
      Rename-file,
    }
  }

  public class DeleteFileOperation : WorkspaceEditOperation
  {

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: delete-file

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("deleteOptions")]
    public DeleteOptionsParams DeleteOptions { get; set; }

    [JsonPropertyName("metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("delete-file")]
      Delete-file,
    }
  }

  public class EditFileOperation : WorkspaceEditOperation
  {

    [JsonPropertyName("type")]
    public TypeEnum Type { get; set; } // Oneof: edit-file

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("edits")]
    public TextEdit[] Edits { get; set; }

    public enum TypeEnum
    {
      [JsonPropertyName("edit-file")]
      Edit-file,
    }
  }
  }
}
