using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewNativeConfigParams
  {
    [JsonProperty(PropertyName = "view")]
    public ViewEnum View { get; set; } // Oneof: multiple, single
    [JsonProperty(PropertyName = "cspSource")]
    public string CspSource { get; set; }
    [JsonProperty(PropertyName = "webviewBundleServingPrefix")]
    public string WebviewBundleServingPrefix { get; set; }
    [JsonProperty(PropertyName = "rootDir")]
    public string RootDir { get; set; }
    [JsonProperty(PropertyName = "injectScript")]
    public string InjectScript { get; set; }
    [JsonProperty(PropertyName = "injectStyle")]
    public string InjectStyle { get; set; }

    public enum ViewEnum
    {
      [EnumMember(Value = "multiple")]
      Multiple,
      [EnumMember(Value = "single")]
      Single,
    }
  }
}
