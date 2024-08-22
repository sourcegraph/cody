using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CreateFilesParams
  {

    [JsonPropertyName("files")]
    public FileIdentifier[] Files { get; set; }
  }
}
