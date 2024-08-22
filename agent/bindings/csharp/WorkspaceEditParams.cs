using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditParams
  {

    [JsonPropertyName("operations")]
    public WorkspaceEditOperation[] Operations { get; set; }

    [JsonPropertyName("metadata")]
    public WorkspaceEditMetadata Metadata { get; set; }
  }
}
