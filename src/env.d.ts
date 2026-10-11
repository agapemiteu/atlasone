// Bindings the OAuth provider injects at runtime (not declared in wrangler.jsonc).
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

declare global {
  interface Env {
    OAUTH_PROVIDER: OAuthHelpers;
  }
}
