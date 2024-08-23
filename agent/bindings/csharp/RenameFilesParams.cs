using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RenameFilesParams
  {
    [JsonProperty(PropertyName = "files")]
    public RenameFile[] Files { get; set; }
  }
}
