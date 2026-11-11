# Auravix Bath Studio Login Page Prompt

Build a polished, responsive login page for **Auravix Bath Studio**, a quotation and lead management CRM.

## Visual direction

- Use a warm off-white background with a very subtle animated radial shader/ring effect behind the content.
- Place one small login card in the exact center of the viewport.
- Use a white card with a thin warm-gray border, soft shadow, and a subtle inner gold border.
- Use the Auravix logo asset at `assets/auravix-logo.jpeg`.
- Under the logo, show:
  - `AURAVIX`
  - `BATH STUDIO` in spaced gold lettering
- Show the heading `Welcome Back`.
- Show the supporting text `Sign in to the Quotation & Lead Management System`.
- Include fields for `Email or username` and `Password`.
- Include a password show/hide eye button, `Forgot password?`, and a gold `Login` button.
- Keep the card compact and centered; do not let it become oversized on desktop or laptop screens.

## Responsive requirements

- Desktop: compact centered card, maximum width about 380px.
- Laptop: reduce vertical spacing so the complete card fits in the viewport.
- Mobile: use the available width with small side margins, keep fields and buttons easy to tap, and allow vertical scrolling only when necessary.
- Prevent horizontal overflow.
- Use `100svh`, `clamp()`, and media queries where helpful.
- Respect `prefers-reduced-motion`.

## Animation requirements

Implement the supplied WebGL shader as a background canvas without requiring Three.js. Use a full-screen canvas, resize it with the viewport, animate it with `requestAnimationFrame`, and keep it behind the login card. If WebGL is unavailable, fall back gracefully to the warm off-white background.

## Interaction requirements

- The password eye button toggles between password and text input.
- The forgot-password link shows an inline status message without navigating away.
- The form should validate that both fields are filled.
- On valid submit, show a loading state and navigate to `index.html` after a short delay.
- Keep the implementation accessible with labels, focus states, ARIA labels, and keyboard support.

## Project constraints

- Use the existing project style and do not introduce a framework unless the project already uses one.
- Keep the login page in `login.html`, `login.css`, and `login.js`.
- Update the local server so `/` and `/login` serve the login page and `/dashboard` serves the dashboard.
- Do not add authentication secrets or pretend that real backend authentication exists.
- Verify the page at desktop, laptop, and mobile viewport sizes before finishing.
