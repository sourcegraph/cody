using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class FileIdentifier
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }
  }
}
