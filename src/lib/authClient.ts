/**
 * Vanilla-JS auth manager for @convex-dev/auth.
 *
 * Handles:
 *  - GitHub OAuth sign-in (production)
 *  - Token storage in localStorage
 *  - Token refresh
 *  - OAuth callback detection
 */
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const JWT_KEY = "__convexAuthJWT";
const REFRESH_KEY = "__convexAuthRefreshToken";
const VERIFIER_KEY = "__convexAuthOAuthVerifier";

export class AuthManager {
  private client: ConvexClient;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private _onAuthChange: (() => void) | null = null;

  constructor(client: ConvexClient) {
    this.client = client;
    this.token = localStorage.getItem(JWT_KEY);
    this.refreshToken = localStorage.getItem(REFRESH_KEY);

    // Set up the auth token provider on the ConvexClient
    this.client.setAuth(
      async () => this.token ?? null,
      () => this._onAuthChange?.(),
    );

    // Start periodic token refresh (every 5 minutes)
    this.refreshTimer = setInterval(() => this.tryRefresh(), 5 * 60 * 1000);
  }

  /** Whether the user has a stored auth token */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** Register a callback for auth state changes */
  onAuthChange(callback: () => void) {
    this._onAuthChange = callback;
  }

  /**
   * Validate that the currently stored token is accepted by Convex.
   * If invalid/expired, clear local tokens and return false.
   */
  async validateSession(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const user = await this.client.query(api.admin.users.currentUser, {});
      if (user) return true;
    } catch {
      // Fall through to clear local token state
    }
    this.clearTokens();
    return false;
  }

  /**
   * Check if the current URL contains an OAuth callback code.
   * If so, exchange it for tokens and return true.
   */
  async handleOAuthCallback(): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return false;

    const verifier = localStorage.getItem(VERIFIER_KEY);
    try {
      const result = await this.unauthenticatedSignIn({
        provider: "github",
        params: { code },
        verifier: verifier ?? undefined,
      });

      if (result?.tokens) {
        this.setTokens(result.tokens.token, result.tokens.refreshToken);
        // Clean up URL and verifier
        localStorage.removeItem(VERIFIER_KEY);
        window.history.replaceState({}, "", window.location.pathname);
        return true;
      }
    } catch (err) {
      console.warn("OAuth callback failed:", err);
      localStorage.removeItem(VERIFIER_KEY);
    }
    return false;
  }

  /** Sign in or sign up with email + password */
  async signInPassword(
    email: string,
    password: string,
    flow: "signIn" | "signUp",
  ): Promise<void> {
    const result = await this.unauthenticatedSignIn({
      provider: "password",
      params: { email, password, flow },
    });
    if (result?.tokens) {
      this.setTokens(result.tokens.token, result.tokens.refreshToken);
    }
  }

  /** Start GitHub OAuth flow (redirects the browser) */
  async signInGitHub(): Promise<void> {
    const result = await this.unauthenticatedSignIn({
      provider: "github",
    });
    if (result?.redirect) {
      // Store the PKCE verifier for the callback
      if (result.verifier) {
        localStorage.setItem(VERIFIER_KEY, result.verifier);
      }
      window.location.href = result.redirect;
    }
  }

  /** Sign out and clear all stored tokens */
  async signOut(): Promise<void> {
    try {
      await this.client.action(api.auth.signOut, {});
    } catch {
      // Ignore errors — we're clearing local state anyway
    }
    this.clearTokens();
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Call the signIn action without existing auth.
   * Uses ConvexHttpClient to avoid needing an authenticated session.
   */
  private async unauthenticatedSignIn(args: {
    provider?: string;
    params?: any;
    verifier?: string;
    refreshToken?: string;
  }): Promise<any> {
    const url = (import.meta as any).env.VITE_CONVEX_URL as string;
    const httpClient = new ConvexHttpClient(url);

    // If we have a current token, set it on the HTTP client too
    // (some providers may need the current session for account linking)
    if (this.token) {
      httpClient.setAuth(this.token);
    }

    return await httpClient.action(api.auth.signIn, args);
  }

  private setTokens(token: string, refreshToken: string) {
    this.token = token;
    this.refreshToken = refreshToken;
    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);

    // Re-set auth provider so the client picks up the new token
    this.client.setAuth(
      async () => this.token ?? null,
      () => this._onAuthChange?.(),
    );
  }

  private clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(VERIFIER_KEY);

    this.client.setAuth(
      async () => null,
      (isAuthenticated) => this._onAuthChange?.(),
    );
  }

  /** Try to refresh the token using the stored refresh token */
  private async tryRefresh() {
    if (!this.refreshToken) return;
    try {
      const result = await this.unauthenticatedSignIn({
        refreshToken: this.refreshToken,
      });
      if (result?.tokens) {
        this.setTokens(result.tokens.token, result.tokens.refreshToken);
      }
    } catch {
      // Refresh failed — token may be expired. User will need to re-auth.
      console.warn("Token refresh failed");
    }
  }
}
