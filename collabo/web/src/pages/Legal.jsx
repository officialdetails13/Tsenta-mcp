import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../App.jsx';

// Privacy Policy, Terms of Service and Data Deletion instructions.
// The text describes what this codebase actually collects and does. Operator details
// (legal name, contact email, address, governing law) come from server env vars via /api/meta.

function useLegal() {
  const { meta } = useSession();
  const l = meta.legal ?? {};
  const contact = l.contact_email
    ? <a href={`mailto:${l.contact_email}`}>{l.contact_email}</a>
    : <span className="muted">[contact email not set]</span>;
  const missing = ['contact_email', 'address', 'jurisdiction'].filter((k) => !l[k]);
  return { l, name: l.name || 'Collabo', contact, missing };
}

function Doc({ title, children }) {
  const { l, missing } = useLegal();
  useEffect(() => { document.title = `${title} · Collabo`; return () => { document.title = 'Collabo'; }; }, [title]);
  return (
    <article className="legal">
      <p className="muted small"><Link to="/">Collabo</Link> · Effective {l.effective}</p>
      <h1>{title}</h1>
      {missing.length > 0 && (
        <div className="legal-draft" role="note">
          <b>Draft.</b> The operator hasn’t set {missing.map((k) => ({ contact_email: 'CONTACT_EMAIL', address: 'LEGAL_ADDRESS', jurisdiction: 'GOVERNING_LAW' })[k]).join(', ')} yet, and this text
          hasn’t been reviewed by a lawyer. Review it before relying on it.
        </div>
      )}
      {children}
      <nav className="legal-nav small" aria-label="Legal"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link><Link to="/data-deletion">Data deletion</Link></nav>
    </article>
  );
}

export function Privacy() {
  const { name, contact, l } = useLegal();
  return (
    <Doc title="Privacy Policy">
      <p>{name} (“Collabo”, “we”) runs a marketplace where businesses hire content creators. This policy explains what we collect, why, who we share it with and the choices you have.{l.address && <> Our address: {l.address}.</>} Questions: {contact}.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details.</b> Your name, email address, role (brand or creator), company name or creator handle, and a hashed version of your password (we never store it in plain text). We record when you accepted these terms.</li>
        <li><b>Profile information you enter.</b> Bio, location, niches, rate packages, social handles and the follower and engagement numbers you type in. These are shown as “self-reported”.</li>
        <li><b>Instagram data, only if you connect it.</b> When a creator connects a professional Instagram account through Instagram’s official login, we receive, with your permission (<code>instagram_business_basic</code>, <code>instagram_business_manage_insights</code>): your Instagram user ID, username, name, profile picture, follower and media counts; your recent posts, reels and stories (captions, links, thumbnails, timestamps, likes and comments counts); insights for those posts (views, reach, saves, shares, replies, average watch time); and audience demographics (age, gender, country, city). We store an access token, encrypted, so we can refresh these numbers. We do not read your messages, and we never post to your account.</li>
        <li><b>Deal content.</b> Offers, counter-offers, contracts and the names you type to sign them, messages, draft links, captions, scripts, feedback, posted links, reviews and results you report.</li>
        <li><b>Payments.</b> The amounts held, released and refunded for each deal and the payment method type you choose (card or bank). Real card or bank details are entered with our payment processor, not stored by us.</li>
        <li><b>Notifications.</b> The in-app notifications we generate for you, and whether you want them by email.</li>
        <li><b>Technical data.</b> Our hosting provider’s servers log IP addresses and request details for security and reliability. We keep your sign-in token in your browser’s local storage. We don’t use advertising or analytics cookies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the marketplace: show creator profiles to businesses, let the two sides negotiate, sign contracts, hold and release payments, and resolve disputes.</li>
        <li>To show verified metrics: Instagram numbers are labeled “Verified via Instagram” with the date they were fetched, so businesses can tell them apart from self-reported numbers.</li>
        <li>To send you notifications about your deals, in the app and, if you leave it on, by email.</li>
        <li>To review content you ask us to review. If you press “AI review” on a draft, the draft’s caption, script and brief are sent to Anthropic’s Claude API to generate feedback.</li>
        <li>To keep the service secure, prevent fraud and comply with law.</li>
      </ul>
      <p>We don’t sell your personal information, and we don’t use Instagram data for advertising or share it with data brokers.</p>

      <h2>Who can see it</h2>
      <ul>
        <li><b>Everyone:</b> creator public profiles (name, handle, bio, location, niches, packages, social stats, connected Instagram posts and insights, aggregate audience demographics, reviews and completed-deal results).</li>
        <li><b>The other party to a deal:</b> your offers, contract, messages, drafts and the payment breakdown for that deal.</li>
        <li><b>Service providers</b> that process data for us: our hosting provider (Render), our email provider (Resend) if email notifications are enabled, Anthropic if you request an AI review, and our payment processor. They may only use it to provide their service to us.</li>
        <li><b>Authorities,</b> when the law requires it, or to protect people’s safety or our rights.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account is open. Instagram data is refreshed at most every six hours and removed as soon as you disconnect Instagram, remove Collabo from your Instagram settings or delete your account. When you delete your account we remove your profile, social data, posts and notifications, and replace your name and email with placeholders. We keep de-identified deal and payment records that the other party, accountants and tax authorities need (usually up to 7 years).</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li><b>Access and download:</b> Account → Download my data gives you everything we hold about you as a JSON file.</li>
        <li><b>Correct:</b> edit your profile in the app at any time.</li>
        <li><b>Delete:</b> Account → Delete account, or see <Link to="/data-deletion">Data deletion</Link>.</li>
        <li><b>Email:</b> turn email notifications off in Account.</li>
        <li>Depending on where you live (for example under the GDPR, UK GDPR, India’s DPDP Act or US state laws such as the CCPA) you may also have rights to object, restrict processing, port your data, withdraw consent and complain to your data protection authority. Contact {contact} and we’ll respond within 30 days.</li>
      </ul>

      <h2>Security</h2>
      <p>Passwords are hashed with scrypt, Instagram tokens are encrypted with AES-256-GCM, and the site is served over HTTPS. No system is perfectly secure; tell us at {contact} if you find a problem.</p>

      <h2>Children</h2>
      <p>Collabo is for people 18 and older. We don’t knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>If we change this policy we’ll update the effective date above and, for significant changes, notify you in the app before they apply.</p>
    </Doc>
  );
}

export function Terms() {
  const { name, contact, l } = useLegal();
  return (
    <Doc title="Terms of Service">
      <p>These terms are an agreement between you and {name} (“Collabo”, “we”). By creating an account you agree to them and to our <Link to="/privacy">Privacy Policy</Link>.</p>

      <h2>1. What Collabo is</h2>
      <p>Collabo is a marketplace. Businesses (“brands”) hire content creators (“creators”) for sponsored content. We provide the tools to find each other, negotiate, sign a contract, hold payment in escrow and resolve disputes. We are not a party to the contract between a brand and a creator, and we don’t employ creators.</p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 18 and able to form a binding contract.</li>
        <li>Give accurate information and keep your password secret. You’re responsible for activity on your account.</li>
        <li>Numbers you enter yourself are shown as self-reported. Don’t misstate your audience, metrics or past results. Numbers labeled “Verified via Instagram” come from Instagram’s official API.</li>
      </ul>

      <h2>3. Deals and contracts</h2>
      <p>When both parties sign a deal’s contract in Collabo, it becomes a binding agreement between them on the terms shown: deliverables, deadline, price, usage rights, exclusivity, revisions and any other terms. Typing your name to sign is your electronic signature.</p>

      <h2>4. Payments, fees and escrow</h2>
      <ul>
        <li>The brand pays the agreed price plus a 5% service fee into escrow before work starts. The creator receives the price minus a 10% service fee.</li>
        <li>30% of the price is released when the brand approves the draft (or automatically 3 days after the draft is submitted if the brand doesn’t respond). The remaining 70% is released when the brand approves the live post (or automatically 5 days after it is delivered).</li>
        <li>If the creator misses the deadline by more than 3 days without delivering, the brand can cancel and get a full refund, including the brand’s fee.</li>
        <li>Performance bonuses, if agreed, are held separately and released if the agreed target is met within 30 days.</li>
        <li>Pay for work agreed on Collabo only through Collabo. Don’t ask the other party to pay or be paid outside the platform.</li>
        <li>You’re responsible for your own taxes.</li>
      </ul>

      <h2>5. Disputes</h2>
      <p>Either party can open a dispute while money is in escrow. The parties can settle by agreeing a split. If they can’t, Collabo mediates: we review the contract, messages and deliverables, then decide how the escrowed money is split. Our decision is final as to the funds held in escrow, without limiting any other legal rights you have against the other party.</p>

      <h2>6. Content</h2>
      <ul>
        <li>Creators keep ownership of their content. They grant the brand the usage rights stated in the contract.</li>
        <li>You give Collabo permission to host and display content you upload or link to, only as needed to run the service.</li>
        <li>Sponsored posts must be clearly disclosed as ads (for example #ad or the platform’s paid-partnership label) as required by the FTC, ASCI or the rules where you are.</li>
        <li>Don’t post anything illegal, deceptive, infringing, hateful or harassing, and don’t make health or financial claims you can’t substantiate.</li>
      </ul>

      <h2>7. Connected accounts</h2>
      <p>If you connect Instagram, you authorize Collabo to read the data described in the Privacy Policy. You can disconnect at any time. Your use of Instagram remains subject to Instagram’s own terms.</p>

      <h2>8. Suspension and closing your account</h2>
      <p>You can delete your account at any time once no money is in escrow on your deals. We may suspend or close accounts that break these terms, commit fraud or put others at risk. Money in escrow is then handled as described in section 5.</p>

      <h2>9. Disclaimers and liability</h2>
      <p>Collabo is provided “as is”. We don’t guarantee any sales, reach or results from a campaign. To the extent the law allows, we aren’t liable for indirect or consequential losses, and our total liability for any claim is limited to the fees you paid us in the 12 months before the claim. Nothing in these terms limits liability that can’t be limited by law.</p>

      <h2>10. Changes and law</h2>
      <p>We may update these terms. We’ll notify you in the app before significant changes apply; continuing to use Collabo after that means you accept them.{l.jurisdiction ? <> These terms are governed by the laws of {l.jurisdiction}.</> : null}</p>

      <h2>11. Contact</h2>
      <p>{contact}{l.address && <>, {l.address}</>}</p>
    </Doc>
  );
}

export function DataDeletion() {
  const { contact } = useLegal();
  const [params] = useSearchParams();
  const code = params.get('code');
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (code) api(`/instagram/deletion-status/${encodeURIComponent(code)}`).then(setStatus).catch(() => setStatus({ status: 'not_found' }));
  }, [code]);

  return (
    <Doc title="Data deletion">
      {code && (
        <div className="card legal-status" role="status">
          <b>Deletion request {code}</b>
          <p className="small">{!status ? 'Checking…' : status.status === 'completed' ? `Completed. We deleted the Instagram data for this account on ${new Date(status.created_at + 'Z').toLocaleDateString()}.` : 'We couldn’t find this request. Check the code or contact us.'}</p>
        </div>
      )}
      <p>You can delete your data from Collabo in any of these ways. Each one works on its own.</p>

      <h2>Remove only your Instagram data</h2>
      <ol>
        <li>Sign in and open <b>Studio</b>.</li>
        <li>In the “Verify with Instagram” card, press <b>Disconnect</b>.</li>
      </ol>
      <p>We immediately delete your stored Instagram token, posts, insights, audience demographics and verified stats. Or, from Instagram: <b>Settings → Website permissions → Apps and websites</b>, then remove Collabo. Instagram tells us, we delete the same data, and you get a confirmation code you can check on this page.</p>

      <h2>Delete your whole account</h2>
      <ol>
        <li>Sign in and open <b>Account</b> (top right).</li>
        <li>Optional: press <b>Download my data</b> first to keep a copy.</li>
        <li>Press <b>Delete account</b> and confirm with your password.</li>
      </ol>
      <p>We delete your profile, social accounts, Instagram data, posts and notifications, and replace your name and email with placeholders. Deals that haven’t been paid for are cancelled. If money is still in escrow on a deal, finish or settle that deal first. We keep de-identified deal and payment records the other party and tax authorities need.</p>

      <h2>Ask us</h2>
      <p>Can’t sign in? Email {contact} from the address on your account with the subject “Delete my data”. We’ll confirm and finish within 30 days.</p>
    </Doc>
  );
}
