using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CreateFilesParams
  {
    [JsonProperty(PropertyName = "files")]
    public FileIdentifier[] Files { get; set; }
  }
}
