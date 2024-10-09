using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ExecuteCommandParams
  {
    [JsonProperty(PropertyName = "command")]
    public string Command { get; set; }
    [JsonProperty(PropertyName = "arguments")]
    public Object[] Arguments { get; set; }
  }
}
