using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AttributionSearchParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("snippet")]
    public string Snippet { get; set; }
  }
}
