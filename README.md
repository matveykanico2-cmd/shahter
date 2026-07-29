This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Release V.1.1.1

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Data storage

The app persists all application data (users, dialogs, messages, channels, contacts, billing requests, etc.) to a single JSON file on disk instead of a database server. By default that file lives at `storage/db.json`, created automatically on first write. Set `JSON_DB_PATH` to point it elsewhere.

Because everything lives on the local filesystem, the app expects to run as a single Node.js process with a persistent disk — no separate database service or container needs to be started before `npm run dev` / `npm run start`.

Push notifications require VAPID keys in the server environment:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

The app also accepts these aliases:

```bash
VAPID_PUBLIC_KEY=...
NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=...
WEB_PUSH_EMAIL=admin@example.com
```

## Billing setup

Safe card payments are configured through YooKassa hosted checkout. Card data is never entered into this app and goes directly through the provider page.

Required environment variables:

```bash
APP_URL=https://your-domain.example
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
```

After deployment:

1. Set the YooKassa webhook URL to `https://your-domain.example/api/billing/yookassa/webhook`.
2. Open the profile page and start a purchase from the billing section.

The current billing flow includes:

- `POST /api/billing/checkout` to create a purchase request and YooKassa payment
- `/billing/return` to refresh payment status after redirect back
- `POST /api/billing/yookassa/webhook` to confirm successful payments server-to-server

If `YOOKASSA_SHOP_ID` or `YOOKASSA_SECRET_KEY` is missing, the UI will keep the purchase flow unavailable until the provider is configured.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercell

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
