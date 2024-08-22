using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AuthStatus
  {

    [JsonPropertyName("username")]
    public string Username { get; set; }

    [JsonPropertyName("endpoint")]
    public string Endpoint { get; set; }

    [JsonPropertyName("isDotCom")]
    public bool IsDotCom { get; set; }

    [JsonPropertyName("isLoggedIn")]
    public bool IsLoggedIn { get; set; }

    [JsonPropertyName("isFireworksTracingEnabled")]
    public bool IsFireworksTracingEnabled { get; set; }

    [JsonPropertyName("showInvalidAccessTokenError")]
    public bool ShowInvalidAccessTokenError { get; set; }

    [JsonPropertyName("authenticated")]
    public bool Authenticated { get; set; }

    [JsonPropertyName("hasVerifiedEmail")]
    public bool HasVerifiedEmail { get; set; }

    [JsonPropertyName("requiresVerifiedEmail")]
    public bool RequiresVerifiedEmail { get; set; }

    [JsonPropertyName("siteHasCodyEnabled")]
    public bool SiteHasCodyEnabled { get; set; }

    [JsonPropertyName("siteVersion")]
    public string SiteVersion { get; set; }

    [JsonPropertyName("codyApiVersion")]
    public int CodyApiVersion { get; set; }

    [JsonPropertyName("configOverwrites")]
    public CodyLLMSiteConfiguration ConfigOverwrites { get; set; }

    [JsonPropertyName("showNetworkError")]
    public bool ShowNetworkError { get; set; }

    [JsonPropertyName("primaryEmail")]
    public string PrimaryEmail { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; }

    [JsonPropertyName("avatarURL")]
    public string AvatarURL { get; set; }

    [JsonPropertyName("userCanUpgrade")]
    public bool UserCanUpgrade { get; set; }

    [JsonPropertyName("isOfflineMode")]
    public bool IsOfflineMode { get; set; }
  }
}
