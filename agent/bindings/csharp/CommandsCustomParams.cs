using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CommandsCustomParams
  {

    [JsonPropertyName("key")]
    public string Key { get; set; }
  }
}
