using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressEndParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
  }
}
