export type LegalDoc = {
  title: string
  updated: string
  summary: string
  sections: Array<{ heading: string; body: string[] }>
}

const contact = 'thabhelo.duve@talladega.edu'
const site = 'https://simply-def0f-e4e3f.web.app'

export const privacyPolicy: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'July 6, 2026',
  summary:
    'Simply helps you read research papers. This policy explains what we collect, why, and how you can control it.',
  sections: [
    {
      heading: 'Who we are',
      body: [
        'Simply (“we”, “us”) provides a Chrome extension and website that turn dense research papers into prerequisite guides.',
        `Questions: ${contact}. Website: ${site}.`,
      ],
    },
    {
      heading: 'What we collect',
      body: [
        'Account information: if you sign in with Google, Firebase Authentication stores your Google account identifier and email so we can verify you when calling our API.',
        'Paper content you submit: when you analyze a paper, we send the page URL, title, and text you choose (selected text or page extract) to our API for processing with Google Gemini.',
        'Generated guides: analysis results are stored in Firestore (Google Cloud) keyed by a hash of the paper content so guides survive server restarts and can be reopened from shared links.',
        'Local data on your device: the extension stores your sign-in session in Chrome storage. The website may store papers you opened in your browser’s local storage under your account.',
        'Technical logs: our cloud provider may log request metadata (timestamps, errors, IP address) for reliability and abuse prevention.',
      ],
    },
    {
      heading: 'What we do not do',
      body: [
        'We do not sell your personal information.',
        'We do not use your data for advertising.',
        'We do not run the extension UI on unrelated sites such as social media; the widget appears only on research-paper pages (see our Security page).',
      ],
    },
    {
      heading: 'How we use information',
      body: [
        'Authenticate you and protect the API from anonymous abuse.',
        'Generate prerequisite guides and PDF/HTML exports you request.',
        'Improve reliability, debug failures, and prevent misuse.',
      ],
    },
    {
      heading: 'Service providers',
      body: [
        'Google Cloud / Firebase — authentication, hosting, and API infrastructure (project: simply-def0f-e4e3f).',
        'Google Gemini — AI analysis of paper text you submit.',
        'These providers process data under their own terms and security programs.',
      ],
    },
    {
      heading: 'Retention',
      body: [
        'Sign-in tokens live in your browser until you sign out or they expire.',
        'Guides are stored in Firestore and kept until you delete the project data. In-memory cache is used only as a fast layer on top.',
        'Server logs are retained only as long as needed for operations and security.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can use Simply without signing in only where the product allows basic mode; full analysis requires sign-in.',
        'Sign out from the extension or website to remove the local session.',
        'Uninstall the extension to remove its local storage.',
        `Contact ${contact} to ask about access or deletion requests.`,
      ],
    },
    {
      heading: 'Children',
      body: ['Simply is not directed at children under 13. We do not knowingly collect their data.'],
    },
    {
      heading: 'Changes',
      body: [
        'We may update this policy. The “Last updated” date at the top will change when we do.',
        'Continued use after changes means you accept the updated policy.',
      ],
    },
  ],
}

export const termsOfService: LegalDoc = {
  title: 'Terms of Service',
  updated: 'July 6, 2026',
  summary: 'Rules for using Simply’s website, API, and Chrome extension.',
  sections: [
    {
      heading: 'Agreement',
      body: [
        'By using Simply, you agree to these Terms and our Privacy Policy.',
        'If you do not agree, do not use the service.',
      ],
    },
    {
      heading: 'The service',
      body: [
        'Simply provides educational prerequisite guides for research papers. Output is generated automatically and may be incomplete or incorrect.',
        'Simply is not a substitute for reading the original paper, coursework, or professional advice.',
        'We may change, suspend, or discontinue features at any time.',
      ],
    },
    {
      heading: 'Your responsibilities',
      body: [
        'You must have the right to submit any text you send for analysis.',
        'Do not misuse the API (scraping, automation abuse, attempts to bypass authentication, or uploading unlawful content).',
        'You are responsible for activity under your Google account when signed in.',
      ],
    },
    {
      heading: 'Intellectual property',
      body: [
        'Research papers belong to their authors and publishers. Simply does not claim ownership of papers you analyze.',
        'We own the Simply name, branding, software, and generated guide formatting except for third-party content embedded in papers.',
        'Guides are provided for your personal learning. Do not republish them as official summaries of the underlying work without appropriate attribution.',
      ],
    },
    {
      heading: 'Disclaimer',
      body: [
        'THE SERVICE IS PROVIDED “AS IS” WITHOUT WARRANTIES OF ANY KIND.',
        'We do not guarantee accuracy, availability, or fitness for a particular purpose.',
      ],
    },
    {
      heading: 'Limitation of liability',
      body: [
        'To the fullest extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from use of Simply.',
        'Our total liability for any claim is limited to the amount you paid us in the past twelve months (currently zero for the free tier).',
      ],
    },
    {
      heading: 'Termination',
      body: [
        'You may stop using Simply at any time.',
        'We may suspend access if you violate these Terms or threaten service stability.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these Terms: ${contact}.`],
    },
  ],
}

export const securityPage: LegalDoc = {
  title: 'Security & Data Handling',
  updated: 'July 6, 2026',
  summary: 'How Simply protects your account, limits extension access, and processes paper text.',
  sections: [
    {
      heading: 'Authentication',
      body: [
        'Sign-in uses Google via Firebase Authentication.',
        'Our API verifies a short-lived Firebase ID token on protected routes. Tokens are sent as Bearer headers, not cookies.',
        'Without a valid token, analyze and ingest endpoints return 401 Unauthorized.',
      ],
    },
    {
      heading: 'Extension permissions (important)',
      body: [
        'Simply does not activate on every website. The content script is registered only for known research hosts (arXiv, OpenReview, major publishers, etc.) and PDF-like paper URLs.',
        'Sites such as instagram.com, facebook.com, or gmail.com do not load the Simply widget.',
        'The extension still needs permission to call our API over HTTPS; that is separate from page injection.',
      ],
    },
    {
      heading: 'What leaves your browser',
      body: [
        'When you click Analyze, the extension sends paper metadata and text to our API over TLS.',
        'Paper text is processed by Google Gemini to produce guides. Do not submit confidential or classified material.',
      ],
    },
    {
      heading: 'Infrastructure',
      body: [
        'API: Google Cloud Run (us-central1).',
        'Website: Firebase Hosting.',
        'Secrets (API keys, service credentials) are stored in Google Secret Manager, not in source code.',
      ],
    },
    {
      heading: 'Reporting issues',
      body: [
        `If you discover a security concern, email ${contact} with steps to reproduce.`,
        'Please do not publicly disclose active vulnerabilities before we have had a reasonable time to respond.',
      ],
    },
  ],
}
