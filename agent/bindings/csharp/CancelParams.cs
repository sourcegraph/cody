using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CancelParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
  }
}
