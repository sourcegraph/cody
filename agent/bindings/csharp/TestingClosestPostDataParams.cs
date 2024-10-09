using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingClosestPostDataParams
  {
    [JsonProperty(PropertyName = "url")]
    public string Url { get; set; }
    [JsonProperty(PropertyName = "postData")]
    public string PostData { get; set; }
  }
}
