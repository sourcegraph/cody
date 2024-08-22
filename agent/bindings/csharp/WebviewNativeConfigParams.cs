using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewNativeConfigParams
  {

    [JsonPropertyName("view")]
    public ViewEnum View { get; set; } // Oneof: multiple, single

    [JsonPropertyName("cspSource")]
    public string CspSource { get; set; }

    [JsonPropertyName("webviewBundleServingPrefix")]
    public string WebviewBundleServingPrefix { get; set; }

    [JsonPropertyName("rootDir")]
    public string RootDir { get; set; }

    [JsonPropertyName("injectScript")]
    public string InjectScript { get; set; }

    [JsonPropertyName("injectStyle")]
    public string InjectStyle { get; set; }

    public enum ViewEnum
    {
      [JsonPropertyName("multiple")]
      Multiple,
      [JsonPropertyName("single")]
      Single,
    }
  }
}
