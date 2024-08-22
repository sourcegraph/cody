using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditMetadata
  {

    [JsonPropertyName("isRefactoring")]
    public bool IsRefactoring { get; set; }
  }
}
