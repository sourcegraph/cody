using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RenameFilesParams
  {

    [JsonPropertyName("files")]
    public RenameFile[] Files { get; set; }
  }
}
