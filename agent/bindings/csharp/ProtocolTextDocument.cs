using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolTextDocument
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "filePath")]
    public string FilePath { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "selection")]
    public Range Selection { get; set; }
    [JsonProperty(PropertyName = "contentChanges")]
    public ProtocolTextDocumentContentChangeEvent[] ContentChanges { get; set; }
    [JsonProperty(PropertyName = "visibleRange")]
    public Range VisibleRange { get; set; }
    [JsonProperty(PropertyName = "testing")]
    public TestingParams Testing { get; set; }
  }
}
