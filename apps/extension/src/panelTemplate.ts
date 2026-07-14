/** Shared analyze-card markup for the popup and in-page widget. */

export function panelCardHtml(analyzeLabel: string): string {
  return `
    <div class="window-bar" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <span class="tiny-pill">Prerequisite guide</span>
    <h2 class="simply-title">Build a calm reading guide for this paper.</h2>
    <p class="simply-copy">Simply reads what you have open and maps the background you need for a first pass.</p>
    <p class="auth-hint" id="simply-auth-hint" hidden>Sign in with Google to analyze papers and save guides.</p>
    <div class="simply-actions">
      <button class="button primary" id="simply-analyze" type="button">${analyzeLabel}</button>
    </div>
    <p class="simply-status" id="simply-status" role="status"></p>
    <div class="simply-results" id="simply-results"></div>
    <button class="button primary simply-open-btn" id="simply-open" type="button" hidden>Reopen guide</button>
  `
}

export function authHeaderHtml(): string {
  return `
    <header class="simply-head">
      <p class="brand">simply</p>
      <div class="auth-slot" id="simply-auth-slot" data-state="loading" aria-live="polite">
        <div class="auth-panel auth-loading" id="simply-auth-loading">Checking sign-in…</div>
        <div class="auth-panel" id="simply-auth-signed-out">
          <button class="auth-signin-btn" id="simply-signin" type="button">Sign in with Google</button>
        </div>
        <div class="auth-panel" id="simply-auth-signed-in">
          <div class="auth-user-chip">
            <span class="avatar" id="simply-avatar" aria-hidden="true"></span>
            <span class="auth-label" id="simply-auth-label"></span>
            <button class="auth-signout-link" id="simply-signout" type="button">Sign out</button>
          </div>
        </div>
      </div>
    </header>
  `
}
