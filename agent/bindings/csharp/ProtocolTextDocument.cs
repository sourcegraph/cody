using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolTextDocument
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("filePath")]
    public string FilePath { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("selection")]
    public Range Selection { get; set; }

    [JsonPropertyName("contentChanges")]
    public ProtocolTextDocumentContentChangeEvent[] ContentChanges { get; set; }

    [JsonPropertyName("visibleRange")]
    public Range VisibleRange { get; set; }

    [JsonPropertyName("testing")]
    public TestingParams Testing { get; set; }
  }
}
