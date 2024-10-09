using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressCancelationResult
  {
    [JsonProperty(PropertyName = "result")]
    public string Result { get; set; }
  }
}
