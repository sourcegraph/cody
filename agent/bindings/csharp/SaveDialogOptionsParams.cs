using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SaveDialogOptionsParams
  {

    [JsonPropertyName("defaultUri")]
    public string DefaultUri { get; set; }

    [JsonPropertyName("saveLabel")]
    public string SaveLabel { get; set; }

    [JsonPropertyName("filters")]
    public Dictionary<string, string[]> Filters { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }
  }
}
