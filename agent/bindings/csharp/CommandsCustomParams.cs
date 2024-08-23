using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CommandsCustomParams
  {
    [JsonProperty(PropertyName = "key")]
    public string Key { get; set; }
  }
}
