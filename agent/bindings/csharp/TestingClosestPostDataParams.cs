using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingClosestPostDataParams
  {

    [JsonPropertyName("url")]
    public string Url { get; set; }

    [JsonPropertyName("postData")]
    public string PostData { get; set; }
  }
}
