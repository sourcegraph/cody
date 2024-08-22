using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingClosestPostDataResult
  {

    [JsonPropertyName("closestBody")]
    public string ClosestBody { get; set; }
  }
}
