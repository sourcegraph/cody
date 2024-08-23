using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodeActionsTriggerParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
  }
}
