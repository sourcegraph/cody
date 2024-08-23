using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MentionParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "data")]
    public Object Data { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
  }
}
