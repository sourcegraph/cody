using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EnvOpenExternalParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }
  }
}
