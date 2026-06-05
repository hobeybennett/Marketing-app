export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-8 text-gray-300">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: May 2025</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">1. Who We Are</h2>
        <p>
          Hitwave ("we", "us", "our") is an automated music promotion platform that helps artists
          create and launch Meta (Facebook/Instagram) advertising campaigns. This Privacy Policy
          explains how we collect, use, and protect your personal information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><span className="text-white font-medium">Account information</span> — your name and email address via Google Sign-In.</li>
          <li><span className="text-white font-medium">Music and campaign data</span> — audio files, cover art, artist name, song title, and visual preferences you provide when creating a campaign.</li>
          <li><span className="text-white font-medium">Meta credentials</span> — if you connect your Meta account, we store an access token, ad account ID, and page ID to create campaigns on your behalf.</li>
          <li><span className="text-white font-medium">Usage data</span> — basic logs of how you interact with the platform.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">3. How We Use Your Information</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>To create and manage your Meta ad campaigns on your behalf.</li>
          <li>To generate video creatives and ad copy using your uploaded content.</li>
          <li>To authenticate you and maintain your account.</li>
          <li>To improve and operate the platform.</li>
        </ul>
        <p>We do not sell your personal data to third parties.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">4. Data Sharing</h2>
        <p>We share data only with the following parties:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><span className="text-white font-medium">Meta Platforms</span> — to create and manage your ad campaigns via the Meta Marketing API.</li>
          <li><span className="text-white font-medium">Anthropic</span> — your artist name and song title are sent to Claude AI to generate ad copy.</li>
          <li><span className="text-white font-medium">Spotify</span> — we look up track metadata using the Spotify API.</li>
          <li><span className="text-white font-medium">Google</span> — used for authentication only.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">5. Data Retention</h2>
        <p>
          Your uploaded audio files and generated video creatives are stored on our servers while
          your account is active. You can delete your campaigns at any time. We retain account
          information for as long as your account exists.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">6. Meta Data Usage</h2>
        <p>
          When you connect your Meta account, we access only the permissions required to create
          and manage ad campaigns on your behalf. We do not access your personal Facebook profile,
          friends list, or any data beyond what is needed to run your ads. Your Meta access token
          is stored securely and used solely to interact with the Meta Marketing API.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>Access the personal data we hold about you.</li>
          <li>Request deletion of your account and associated data.</li>
          <li>Disconnect your Meta account at any time via Settings.</li>
          <li>Withdraw consent for us to act on your Meta account.</li>
        </ul>
        <p>To exercise these rights, contact us at the email below.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">8. Security</h2>
        <p>
          We take reasonable technical measures to protect your data, including encrypted
          connections (HTTPS) and secure storage of credentials. No system is 100% secure;
          please contact us immediately if you suspect any unauthorised access.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">9. Contact</h2>
        <p>
          For privacy questions or data requests, email us at{' '}
          <a href="mailto:privacy@hitwave.app" className="text-blue-400 hover:underline">
            privacy@hitwave.app
          </a>.
        </p>
      </section>
    </div>
  );
}
