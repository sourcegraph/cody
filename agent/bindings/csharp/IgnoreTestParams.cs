using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class IgnoreTestParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }
  }
}
