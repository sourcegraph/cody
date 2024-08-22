using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingExportedTelemetryEventsResult
  {

    [JsonPropertyName("events")]
    public TestingTelemetryEvent[] Events { get; set; }
  }
}
