using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ExecuteCommandParams
  {

    [JsonPropertyName("command")]
    public string Command { get; set; }

    [JsonPropertyName("arguments")]
    public Object[] Arguments { get; set; }
  }
}
