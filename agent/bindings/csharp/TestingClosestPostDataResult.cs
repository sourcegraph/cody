using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingClosestPostDataResult
  {
    [JsonProperty(PropertyName = "closestBody")]
    public string ClosestBody { get; set; }
  }
}
