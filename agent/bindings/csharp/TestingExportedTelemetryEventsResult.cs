using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingExportedTelemetryEventsResult
  {
    [JsonProperty(PropertyName = "events")]
    public TestingTelemetryEvent[] Events { get; set; }
  }
}
