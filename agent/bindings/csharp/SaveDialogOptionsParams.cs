using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SaveDialogOptionsParams
  {
    [JsonProperty(PropertyName = "defaultUri")]
    public string DefaultUri { get; set; }
    [JsonProperty(PropertyName = "saveLabel")]
    public string SaveLabel { get; set; }
    [JsonProperty(PropertyName = "filters")]
    public Dictionary<string, string[]> Filters { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
  }
}
