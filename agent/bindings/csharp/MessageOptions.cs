using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MessageOptions
  {
    [JsonProperty(PropertyName = "modal")]
    public bool Modal { get; set; }
    [JsonProperty(PropertyName = "detail")]
    public string Detail { get; set; }
  }
}
