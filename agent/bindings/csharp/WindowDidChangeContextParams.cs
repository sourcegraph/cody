using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WindowDidChangeContextParams
  {
    [JsonProperty(PropertyName = "key")]
    public string Key { get; set; }
    [JsonProperty(PropertyName = "value")]
    public string Value { get; set; }
  }
}
