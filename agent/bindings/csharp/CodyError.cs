using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyError
  {

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("cause")]
    public CodyError Cause { get; set; }

    [JsonPropertyName("stack")]
    public string Stack { get; set; }
  }
}
