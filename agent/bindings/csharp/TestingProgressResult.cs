using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressResult
  {
    [JsonProperty(PropertyName = "result")]
    public string Result { get; set; }
  }
}
