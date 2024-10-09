using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditParams
  {
    [JsonProperty(PropertyName = "operations")]
    public WorkspaceEditOperation[] Operations { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditMetadata Metadata { get; set; }
  }
}
