using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WindowDidChangeContextParams
  {

    [JsonPropertyName("key")]
    public string Key { get; set; }

    [JsonPropertyName("value")]
    public string Value { get; set; }
  }
}
