using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditEntryMetadata
  {

    [JsonPropertyName("needsConfirmation")]
    public bool NeedsConfirmation { get; set; }

    [JsonPropertyName("label")]
    public string Label { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("iconPath")]
    public Uri IconPath { get; set; }
  }
}
