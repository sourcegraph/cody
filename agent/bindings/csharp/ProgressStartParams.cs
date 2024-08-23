using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressStartParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "options")]
    public ProgressOptions Options { get; set; }
  }
}
