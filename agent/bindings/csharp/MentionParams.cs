using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MentionParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("data")]
    public Object Data { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }
  }
}
