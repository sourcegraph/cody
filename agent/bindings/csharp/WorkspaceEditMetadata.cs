using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditMetadata
  {
    [JsonProperty(PropertyName = "isRefactoring")]
    public bool IsRefactoring { get; set; }
  }
}
