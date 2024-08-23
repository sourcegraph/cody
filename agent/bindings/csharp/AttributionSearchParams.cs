using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AttributionSearchParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "snippet")]
    public string Snippet { get; set; }
  }
}
