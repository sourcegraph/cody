using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DeleteFilesParams
  {

    [JsonPropertyName("files")]
    public FileIdentifier[] Files { get; set; }
  }
}
