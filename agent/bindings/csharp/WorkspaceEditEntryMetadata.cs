using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceEditEntryMetadata
  {
    [JsonProperty(PropertyName = "needsConfirmation")]
    public bool NeedsConfirmation { get; set; }
    [JsonProperty(PropertyName = "label")]
    public string Label { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "iconPath")]
    public Uri IconPath { get; set; }
  }
}
