using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyError
  {
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
    [JsonProperty(PropertyName = "cause")]
    public CodyError Cause { get; set; }
    [JsonProperty(PropertyName = "stack")]
    public string Stack { get; set; }
  }
}
