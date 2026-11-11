# Meta App Review kit (Instagram API with Instagram Login)

Everything to paste into the Meta app dashboard to get `instagram_business_basic` and
`instagram_business_manage_insights` approved. Replace `https://collabo-51m1.onrender.com`
if your domain changes.

## Before you submit (checklist)

- [ ] Render env vars set: `IG_APP_ID`, `IG_APP_SECRET`, `IG_REDIRECT_URI`, `PUBLIC_URL`, `CONTACT_EMAIL`, `LEGAL_NAME` (and ideally `LEGAL_ADDRESS`, `GOVERNING_LAW`). With `CONTACT_EMAIL`, `LEGAL_ADDRESS` and `GOVERNING_LAW` set, the "Draft" banner disappears from the legal pages.
- [ ] Persistent disk attached on Render (otherwise tokens and synced data are wiped on each deploy, and the reviewer's test may break).
- [ ] Your own Instagram professional account added as an **Instagram tester** and the connect flow tested end to end.
- [ ] Legal pages reviewed by you (and ideally a lawyer): they describe what this code actually does.
- [ ] Business verification done in the Meta business portfolio (required for Advanced Access).

## App settings → Basic

| Field | Value |
|---|---|
| App icon (1024 × 1024) | `web/public/icon-1024.png` |
| Privacy Policy URL | `https://collabo-51m1.onrender.com/privacy` |
| Terms of Service URL | `https://collabo-51m1.onrender.com/terms` |
| User data deletion | **Data deletion callback URL**: `https://collabo-51m1.onrender.com/api/instagram/data-deletion` (instructions page for people: `https://collabo-51m1.onrender.com/data-deletion`) |
| Category | Business and pages |
| App domains | `collabo-51m1.onrender.com` |
| Contact email | the same address as `CONTACT_EMAIL` |

## Instagram → API setup with Instagram login → Business login settings

| Field | Value |
|---|---|
| OAuth redirect URI | `https://collabo-51m1.onrender.com/api/connect/instagram/callback` |
| Deauthorize callback URL | `https://collabo-51m1.onrender.com/api/instagram/deauthorize` |
| Data deletion request URL | `https://collabo-51m1.onrender.com/api/instagram/data-deletion` |

## Permission: `instagram_business_basic`

**How will your app use this permission?**

> Collabo is a marketplace where small businesses hire Instagram creators for sponsored content. A creator connects their own Instagram professional account in Collabo's Studio page so businesses can see verified, not self-reported, profile information. We use instagram_business_basic to read the creator's username, name, profile picture, follower count and media count, and their recent posts, reels and stories (caption, media type, thumbnail, permalink, timestamp, like and comment counts). We show this on the creator's public Collabo profile, labeled "Verified via Instagram" with the date it was fetched, so brands can choose creators based on accurate numbers. We only read data from accounts whose owners connected them. We never post, comment or send messages. Creators can disconnect at any time, which immediately deletes the data.

## Permission: `instagram_business_manage_insights`

**How will your app use this permission?**

> After a creator connects their Instagram professional account, we use instagram_business_manage_insights to read insights for their recent media (views, reach, saves, shares, replies and average reel watch time) and their follower demographics (age, gender, country, city). We compute averages (for example average reach per reel and engagement rate) and show them on the creator's Collabo profile and in a side-by-side comparison so businesses can estimate what a sponsored post will deliver before they pay. Each number links to an explanation of the exact API field it came from and when it was fetched. Insights are refreshed at most every 6 hours and are deleted when the creator disconnects or deletes their Collabo account. We don't use this data for advertising and don't share it with third parties.

## Reviewer instructions (paste into "Testing instructions")

> 1. Open https://collabo-51m1.onrender.com/join/creator and create a creator account (any email, password of 8+ characters), accepting the Terms.
> 2. You land on Studio. In the "Verify with Instagram" card, press **Connect Instagram** and sign in with the Instagram test account below. Approve both permissions.
> 3. You're returned to Studio with "Instagram connected." The card shows the connected username and the time of the last sync.
> 4. Click **View public profile** (or open the "Discover" tab as a signed-out visitor). The profile shows follower count, posts/reels/stories with views, reach and saves, and audience demographics, each with a green "Verified via Instagram" badge. Click any number to see which Instagram API field it came from.
> 5. Back in Studio, press **Disconnect**: the verified data is removed immediately.
> 6. Data deletion: Account (bell icon, top right) → **Download my data** / **Delete account**. Instructions at /data-deletion.
>
> Test Instagram account: [username / password of a tester account you created for review]

## Screencast (one per permission; 1–2 minutes each)

Record at 1280 px wide with captions on. Show:

1. **instagram_business_basic**: signed-out landing page → Join as creator → Studio → Connect Instagram → Instagram login and consent screen (show the permission names) → back in Studio with username shown → public profile with profile photo, follower count and the media grid.
2. **instagram_business_manage_insights**: the same connected profile → open a reel to show views, reach, saves, shares and watch time → open the audience section (age/gender/country) → click a number to show the "Where this number comes from" panel → Compare page with two creators.
3. Finish both with Disconnect and the data disappearing.

## Common rejection reasons to avoid

- Privacy policy URL not reachable or not mentioning Instagram data: `/privacy` covers it.
- Screencast doesn't show the Meta login/consent screen: record it, don't skip it.
- Reviewer can't log in: give a working test account and keep the Render service awake (free instances sleep after 15 minutes; open the site just before submitting, or use a paid instance).
- Requesting permissions you don't use: request only the two above.
