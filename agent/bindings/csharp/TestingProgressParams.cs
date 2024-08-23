using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressParams
  {
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
  }
}
