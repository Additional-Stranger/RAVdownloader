# Privacy Policy — RAVdownloader

**Effective date:** 2026-07-28
**Last updated:** 2026-07-28

RAVdownloader ("the App") is a desktop application developed and operated by Colin Christy ("we", "us", "our"). This Privacy Policy explains what data we collect, why we collect it, how we protect it, and your rights.

> **Not legal advice.** This document is a good-faith template. It is not a substitute for advice from a qualified attorney. Users and operators should consult a lawyer to confirm it meets your jurisdiction's requirements (GDPR, CCPA, CPRA, PIPEDA, etc.).

## 1. Who we are

- **Data controller:** Colin Christy
- **Contact:** colin@colinchristy.cc

## 2. Data we collect

When you create an account we collect:

| Field | Why we need it |
|---|---|
| First name, last name | To personalize communication and identify accounts |
| Email address | To sign you in, send account-related notifications, and contact you about the App |
| Password | Stored only as a salted PBKDF2-SHA256 hash. We can never see or recover your password. |

When you use the App we automatically collect:

| Data | Why we need it |
|---|---|
| App version | To help you keep up to date and to plan support for older versions |
| Operating system / platform (e.g., "win-x64", "mac-arm64") | Same as above |
| Timestamp of your last login and last app launch | To identify inactive accounts and detect suspicious activity |
| IP address (at sign-in) | For security auditing, rate limiting, and abuse prevention |
| User agent string (at sign-in) | Same as above |

We do **not** collect or send:
- The URLs you download
- The files you produce
- Your video content, project files, or any media
- Analytics or third-party tracking data
- Location beyond IP-derived approximate geolocation

## 3. How we store your data

- Personal data (name, email) is stored **encrypted at rest** using AES-256-GCM with a key that is not stored alongside the data.
- Passwords are stored as **PBKDF2-SHA256** hashes with 100,000 iterations and a unique per-user salt. Even if our database were leaked, passwords would remain unrecoverable through brute force for the foreseeable future.
- Your data is hosted on Cloudflare (D1 database, Workers runtime). Cloudflare's data centers are geographically distributed.
- All traffic between the App and our servers is transmitted over HTTPS/TLS.

## 4. How we use your data

We use the data listed above to:
1. Provide the App's authentication and access-control features.
2. Send transactional emails (account approval, denial, lock notifications).
3. Prevent abuse (rate limiting, account lockout after failed logins).
4. Understand what versions of the App are in active use so we can plan updates and drop legacy support responsibly.
5. Communicate with you about material changes to the service.

We do **not** sell your data. We do **not** share it with advertising networks or data brokers.

## 5. Third parties we use

| Service | Purpose | Data shared |
|---|---|---|
| Cloudflare (Workers, D1, Pages, R2) | Hosting, database, CDN | All account and telemetry data listed above |
| Resend (resend.com) | Transactional email delivery | Your email address, first name, and the content of the emails we send you |

Both providers act as **data processors** on our behalf and are contractually obligated to protect your data.

## 6. How long we keep your data

- **Active accounts:** kept for as long as you have an account.
- **Denied accounts:** kept indefinitely so you can re-apply and so we can maintain an audit trail. You can request deletion at any time.
- **Deleted accounts:** all personal data and version history are removed within 30 days.
- **Login attempt logs and admin audit logs:** kept for up to 12 months for security purposes.

## 7. Your rights

Depending on where you live, you may have the right to:
- **Access** the personal data we hold about you
- **Correct** inaccurate personal data
- **Delete** your account and associated personal data
- **Object** to or **restrict** processing
- **Portability** — receive your data in a machine-readable format
- **Withdraw consent** at any time

To exercise any of these rights, email **colin@colinchristy.cc**. We will respond within 30 days.

## 8. Children

The App is not directed at children under 13 (or under 16 in the EU/EEA). We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us and we will delete it.

## 9. Security

We follow reasonable security practices, including:
- Encryption in transit (TLS) and at rest (AES-GCM) for personal data
- Salted, stretched password hashing (PBKDF2-SHA256, 600k iterations)
- Rate limiting and account lockout after repeated failed logins
- Least-privilege secrets management
- Regular security review of code changes

No system is 100% secure. If we become aware of a data breach affecting your data, we will notify you and the appropriate authorities within 72 hours where required by law.

## 10. Changes to this policy

We may update this Privacy Policy from time to time. When we do, we'll update the "Last updated" date at the top and, for material changes, notify you by email or through the App.

## 11. Contact

Questions or requests: **colin@colinchristy.cc**
